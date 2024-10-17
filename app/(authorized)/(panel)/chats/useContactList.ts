import { useSupabase } from "@/components/supabase-provider";
import { DBTables } from "@/lib/enums/Tables";
import { timeSince } from "@/lib/time-utils";
import { Contact } from "@/types/contact";
import { useCallback, useEffect, useRef, useState } from "react";

function sortContacts(contacts: Contact[]) {
    contacts.sort((a: Contact, b: Contact) => {
        if (!a.last_message_at || !b.last_message_at) {
            return 0;
        }
        const aDate = new Date(a.last_message_at)
        const bDate = new Date(b.last_message_at)
        if (aDate > bDate) {
            return -1;
        } else if (bDate > aDate) {
            return 1;
        }
        return 0;
    })
}

export function useContactList(search: string, active: boolean) {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const { supabase } = useSupabase()
    const fetchedUntil = useRef<string | null>(null);
    const noMore = useRef<boolean>(false);
    const pageSize = 100
    const getContacts = useCallback(async (active: boolean, before: string | undefined = undefined) => {
        let query = supabase
            .from(DBTables.Contacts)
            .select('*')
            .filter('in_chat', 'eq', true)
            .order('last_message_at', { ascending: false })
            .limit(pageSize)
        if (before) {
            query = query.filter('last_message_at', 'lt', before)
        }
        if (active) {
            query = query.filter('last_message_received_at', 'gt', new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString())
        } else {
            query = query.filter('last_message_received_at', 'lte', new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString())
        }
        const { data, error } = await query
        if (error) {
            throw error
        }
        return data;
    }, [supabase])
    const loadMore = useCallback(async () => {
        if (fetchedUntil.current && !noMore.current && !isLoading) {
            setIsLoading(true)
            try {
                const newContacts = await getContacts(active, fetchedUntil.current)
                if (newContacts.length > 0) {
                    setContacts(prev => [...prev, ...newContacts])
                    fetchedUntil.current = newContacts[newContacts.length - 1].last_message_at
                }
                if (newContacts.length < pageSize) {
                    noMore.current = true
                }
            } finally {
                setIsLoading(false)
            }
        }
    }, [getContacts, fetchedUntil, isLoading, setIsLoading, active])
    useEffect(() => {
        setIsLoading(true)
        getContacts(active).then((contacts) => {
            setContacts(contacts)
            if (contacts.length > 0) {
                fetchedUntil.current = contacts[contacts.length - 1].last_message_at
            }
            if (contacts.length < pageSize) {
                noMore.current = true
            }
        }).catch((error) => {
            console.error('Error in useEffect', error)
        }).finally(() => {
            setIsLoading(false)
        })
    }, [getContacts, setContacts, setIsLoading, active]);
    useEffect(() => {
        const channel = supabase.channel('chat-contacts')
            .on<Contact>(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: DBTables.Contacts,
                    filter: `in_chat=eq.true`,
                },
                payload => {
                    setContacts((existingContacts) => {
                        switch (payload.eventType) {
                            case "INSERT":
                                if (fetchedUntil.current && payload.new.last_message_at) {
                                    if (new Date(payload.new.last_message_at) > new Date(fetchedUntil.current)) {
                                        existingContacts.push(payload.new)
                                        sortContacts(existingContacts)
                                        return [...existingContacts]
                                    }
                                } else {
                                    existingContacts.push(payload.new)
                                    sortContacts(existingContacts)
                                    return [...existingContacts]
                                }
                            case "UPDATE":
                                const indexOfItem = existingContacts.findIndex(contact => contact.wa_id === payload.new.wa_id)
                                if (indexOfItem !== -1) {
                                    existingContacts[indexOfItem] = payload.new
                                } else if (fetchedUntil.current && payload.new.last_message_at && new Date(payload.new.last_message_at) > new Date(fetchedUntil.current)) {
                                    console.warn(`Could not find contact to update contact for id: ${payload.new.wa_id}`)
                                    existingContacts.splice(0, 0, payload.new)
                                } else {
                                    existingContacts.splice(0, 0, payload.new)
                                }
                                sortContacts(existingContacts)
                                if (existingContacts.length > 0) {
                                    fetchedUntil.current = existingContacts[existingContacts.length - 1].last_message_at
                                }
                                return [...existingContacts]
                            case "DELETE":
                                const waId = (payload.old as Partial<Contact>).wa_id;
                                const newContacts = existingContacts.filter((item: Contact) => item.wa_id != waId)
                                return [...newContacts]
                            }
                        return existingContacts
                    })
                }
            )
            .subscribe()
        return () => { supabase.removeChannel(channel) };
    }, [supabase, setContacts])
    return [contacts, loadMore, isLoading] as const;
}