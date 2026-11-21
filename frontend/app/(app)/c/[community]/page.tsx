"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CommunityAssetsPage from "@/features/communities/CommunityAssetsPage";

export default function CommunityPage({ params }: { params: Promise<{ community: string }> }) {
  const router = useRouter();
  const [community, setCommunity] = useState<string>("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => { setCommunity((await params).community); setReady(true); })();
  }, [params]);

  useEffect(() => {
    if (!ready || !community) return;
    // Desktop: redirect to last visited asset (default general)
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      try {
        const stored = localStorage.getItem("square:lastAsset");
        const map = stored ? JSON.parse(stored) : {};
        const target = map[community] || "general";
        router.replace(`/c/${community}/${target}`);
      } catch {
        router.replace(`/c/${community}/general`);
      }
    }
  }, [ready, community, router]);

  if (!ready) return null;
  return <CommunityAssetsPage community={community} />;
}
