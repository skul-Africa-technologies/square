import { ChannelView } from "@/features/channels/ChannelView";
export default async function ChannelTabPage({ params }: { params: Promise<{ community: string; channel: string; tab: string }> }) {
  const p = await params;
  return <ChannelView community={p.community} channel={p.channel} tab={p.tab} />;
}
