import { describe, expect, it } from "vitest";
import { ASSET_CATALOG, ASSET_CATEGORY_ORDER, DEFAULT_ASSETS } from "@square/shared";
import { mockApi } from "./mock";
import { communities } from "./seed";

describe("mock community assets", () => {
  it("returns all undeletable defaults for every seeded community", async () => {
    const details = await Promise.all(communities.map((community) => mockApi.getCommunity(community.slug)));
    const defaultKeys = DEFAULT_ASSETS.map((asset) => asset.key);

    for (const detail of details) {
      const defaults = detail.assets.filter((asset) => asset.isDefault);
      expect(defaults.map((asset) => asset.catalogKey)).toEqual(defaultKeys);
      expect(defaults.every((asset) => asset.isDefault)).toBe(true);

      await Promise.all(defaults.map((asset) =>
        expect(mockApi.deleteAsset(asset.id)).rejects.toThrow("Default assets cannot be deleted"),
      ));
    }
  });

  it("uses mock membership roles for the signed-in user", async () => {
    await expect(mockApi.getCommunity("design-lab")).resolves.toMatchObject({ community: { role: "owner" } });
    await expect(mockApi.getCommunity("web3-club")).resolves.toMatchObject({ community: { role: "moderator" } });
    await expect(mockApi.getCommunity("ai-circle")).resolves.toMatchObject({ community: { role: "member" } });
  });

  it("uses catalog categories and allows an owner to add an asset", async () => {
    expect(ASSET_CATALOG.find((asset) => asset.key === "showcase")?.category).toBe("Community");
    expect(ASSET_CATALOG.find((asset) => asset.key === "feedback")?.category).toBe("Community");

    const added = await mockApi.addAsset("design-lab", "support");
    const groups = await mockApi.listCommunityAssets("design-lab");
    expect(added.category).toBe("Community");
    expect(groups.find((group) => group.category === "Community")?.assets.at(-1)?.catalogKey).toBe("support");
    expect(groups.map((group) => group.category)).toEqual(
      ASSET_CATEGORY_ORDER.filter((category) => groups.some((group) => group.category === category)),
    );
  });

  it("creates every new community with the ordered default assets", async () => {
    const community = await mockApi.createCommunity({ name: "Test community" });
    const detail = await mockApi.getCommunity(community.slug);
    expect(detail.assets.filter((asset) => asset.isDefault).map((asset) => asset.catalogKey))
      .toEqual(DEFAULT_ASSETS.map((asset) => asset.key));
  });
});
