import { redirect } from "next/navigation";
export default async function ChannelPage({ params }: { params: Promise<{ community: string; channel: string }> }) {
  const { community, channel } = await params;
  redirect(`/c/${community}/${channel}/general`);
}
