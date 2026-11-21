import { CommunityAssetView } from "@/features/communities/CommunityAssetView";

export default async function AssetPage({ params }: { params: Promise<{ community: string; asset: string }> }) {
  const { community, asset } = await params;
  return <CommunityAssetView community={community} asset={asset} />;
}