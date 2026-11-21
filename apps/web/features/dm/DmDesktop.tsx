"use client";
import { ConversationsView } from "./ConversationsView";

export function DmDesktop() {
  return (
    <>
      <div className="hidden lg:flex h-full min-h-[70vh] items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <h2 className="font-heading text-lg font-semibold">Direct Messages</h2>
          <p className="text-sm text-muted mt-1">Select a conversation from the left or start one from a profile.</p>
        </div>
      </div>
      <div className="lg:hidden"><ConversationsView /></div>
    </>
  );
}
