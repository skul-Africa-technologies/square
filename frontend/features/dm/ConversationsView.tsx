"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getInitials } from "@square/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";
import { UnreadBadge } from "@/components/messages/UnreadBadge";

export function ConversationsView({ compact }: { compact?: boolean }) {
  const { data, isLoading } = useQuery({ queryKey: ["conversations"], queryFn: () => api.listConversations(), staleTime: 10_000, refetchInterval: 20_000 }); // PROPOSED
  if (isLoading) return <div className="p-4 space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;
  const items = data || [];
  return (
    <div className={compact ? "h-full overflow-auto" : "p-4 max-w-3xl mx-auto"}>
      {!compact && <h1 className="font-heading text-2xl font-semibold mb-4">Messages</h1>}
      {items.length === 0 && <Empty title="No conversations yet" hint="Start a message from someone’s profile." />}
      <div className="space-y-2">
        {items.map(c => (
          <Link key={c.id} href={`/dm/${c.id}`} prefetch={false} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-surface p-3 hover:border-lime/40">
            <div className="h-10 w-10 rounded-full bg-surface-hi flex items-center justify-center text-xs font-semibold">{getInitials(c.participant.username)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">#{c.participant.username}</span>
                <span className="text-xs text-muted">{c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
              </div>
              <p className="text-xs text-muted truncate">{c.blocked ? "You can't message this user" : c.lastMessage || "No messages yet"}</p>
            </div>
            <UnreadBadge unread={c.unreadCount} mentions={c.mentions || 0} ringClassName="ring-surface" />
          </Link>
        ))}
      </div>
    </div>
  );
}
