'use client'

import { LoaderCircleIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import ContactUI from "./ContactUI";
import { useContactList } from "./useContactList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ChatContactsClient() {
    const [active, setActive] = useState<boolean>(true)
    const [contacts, loadMore, isLoading] = useContactList('', active)
    const chatListRef = useRef<HTMLDivElement>(null);
    const onDivScroll = useCallback(async (event: React.UIEvent<HTMLDivElement>) => {
        const current = chatListRef.current;
        if (current) {
            const isAtBottom = (current.scrollHeight - current.scrollTop) - 500 <= current.clientHeight;

            if (isAtBottom) {
                await loadMore();
            }
        }
    }, [loadMore, chatListRef]);

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] overflow-y-auto" ref={chatListRef} onScroll={onDivScroll}>
            {contacts && contacts.map(contact => {
                return <ContactUI key={contact.wa_id} contact={contact} />
            })}
            {!contacts && <div>No contacts to show</div>}
            {isLoading && (
                <div className="w-full flex justify-center items-center py-4">
                    <LoaderCircleIcon className="animate-spin" />
                </div>
            )}
        </div>
    )
}
