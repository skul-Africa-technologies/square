import { ThreadView } from "./ThreadView";

export function ThreadScreen({ conversationId }: { conversationId: string }) {
  return (
    <div className="max-w-4xl mx-auto w-full h-full">
      <ThreadView conversationId={conversationId} />
    </div>
  );
}
