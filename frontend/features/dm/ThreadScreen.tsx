"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ThreadView } from "./ThreadView";
import { toDisplayUsername } from "@square/shared";
import { RobotAvatar } from "@/components/ui/redesign";

export function ThreadScreen({ conversationId }: { conversationId: string }) {
  const { data: conv } = useQuery({ queryKey: ["conversation", conversationId], queryFn: () => api.getConversation(conversationId) }); // PROPOSED
  const username = conv?.participant.username || "";
  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 min-w-0 h-full"><ThreadView key={conversationId} conversationId={conversationId} /></div>
      <aside className="hidden min-[1100px]:block w-72 shrink-0 border-l bg-bg-2 p-4 overflow-auto">
        <div className="rounded-xl border bg-surface p-4">
          {conv && <div className="mb-3"><RobotAvatar id={conv.participant.id} pictureUrl={conv.participant.avatarUrl} size={48} online={conv.presence === "online"} /></div>}
          <div className="font-heading font-semibold">{username ? toDisplayUsername(username) : "User"}</div>
          <div className="mt-3 flex flex-col gap-2">
            {username && <Link href={`/u/${username}`} prefetch={false} className="inline-flex items-center justify-center rounded-lg border bg-bg-2 px-3 py-2 text-sm hover:bg-surface-hi">View profile</Link>}
            <button className="rounded-lg border bg-bg-2 px-3 py-2 text-sm text-muted hover:text-text" type="button">Block</button>
            <button className="rounded-lg border bg-bg-2 px-3 py-2 text-sm text-muted hover:text-text" type="button">Report</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
