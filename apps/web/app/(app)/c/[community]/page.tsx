import { redirect } from "next/navigation";
export default async function CommunityPage({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  redirect(`/c/${community}/general/general`);
}
