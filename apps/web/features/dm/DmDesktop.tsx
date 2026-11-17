import { ConversationsView } from "./ConversationsView";

export function DmDesktop() {
  return (
    <div className="grid lg:grid-cols-[320px_1fr] h-full min-h-[70vh]">
      <div className="border-r p-3 hidden lg:block"><ConversationsView compact /></div>
      <div className="p-4">
        <div className="h-full min-h-[60vh] rounded-xl border bg-surface flex items-center justify-center text-center p-6">
          <div>
            <h2 className="font-heading text-lg font-semibold">Messages</h2>
            <p className="text-sm text-muted mt-1">Select a conversation or start one from a profile.</p>
          </div>
        </div>
      </div>
      <div className="lg:hidden"><ConversationsView /></div>
    </div>
  );
}
