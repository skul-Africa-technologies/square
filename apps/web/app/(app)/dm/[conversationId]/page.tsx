import { ThreadScreen } from "@/features/dm/ThreadScreen";

export default async function DmThreadPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return <ThreadScreen conversationId={conversationId} />;
}
