import { describe, expect, it } from "vitest";
import { mockApi } from "./mock";

describe("mock mention contract", () => {
  it("provides all three unread badge states in assets and DMs", async () => {
    const groups = await mockApi.listCommunityAssets("web3-club");
    const assets = groups.flatMap(group => group.assets);
    expect(assets.find(asset => asset.id === "wc-announcements")).toMatchObject({ unreadCount: 1, mentions: 1 });
    expect(assets.find(asset => asset.id === "wc-support")).toMatchObject({ unreadCount: 3, mentions: 0 });
    expect(assets.find(asset => asset.id === "wc-general")).toMatchObject({ unreadCount: 12, mentions: 2 });

    const conversations = await mockApi.listConversations();
    expect(conversations.find(conversation => conversation.id === "dm1")).toMatchObject({ unreadCount: 2, mentions: 1 });
    expect(conversations.find(conversation => conversation.id === "dm4")).toMatchObject({ unreadCount: 1, mentions: 0 });
    expect(conversations.find(conversation => conversation.id === "dm7")).toMatchObject({ unreadCount: 2, mentions: 2 });
  });

  it("returns unseen mentions and records a seen update", async () => {
    expect((await mockApi.listPosts("wc-general")).items.length).toBeGreaterThan(40);
    expect(await mockApi.listMentions("asset", "wc-general")).toEqual([
      expect.objectContaining({ messageId: "p14" }),
      expect.objectContaining({ messageId: "p-long-21" }),
    ]);
    await mockApi.markMentionsSeen("asset", "wc-general", { messageIds: ["p14"] });
    expect(await mockApi.listMentions("asset", "wc-general")).toEqual([
      expect.objectContaining({ messageId: "p-long-21" }),
    ]);
    await mockApi.markMentionsSeen("asset", "wc-general", { messageIds: ["p-long-21"] });
    expect(await mockApi.listMentions("asset", "wc-general")).toEqual([]);
  });

  it("paginates the large asset picker and restricts a DM picker to its peer", async () => {
    const firstPage = await mockApi.mentionableMembers("asset", "wc-general", { limit: 8 });
    expect(firstPage.items).toHaveLength(8);
    expect(firstPage.nextCursor).toBeTruthy();

    const match = await mockApi.mentionableMembers("asset", "wc-general", { q: "campus-member-49", limit: 8 });
    expect(match.items.map(member => member.username)).toContain("campus-member-490");

    const dm = await mockApi.mentionableMembers("dm", "dm1");
    expect(dm.items.map(member => member.username)).toEqual(["tunde-ade"]);
  });
});
