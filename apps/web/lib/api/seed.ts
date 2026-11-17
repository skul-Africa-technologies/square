import type { Badge, BlockedUser, Campaign, Channel, Community, Conversation, DirectMessage, Post, Project, School, Tab, User } from "@square/shared";

export const schools: School[] = [
  { id: "fut-minna", name: "FUT Minna" },
  { id: "unilag", name: "University of Lagos" },
  { id: "oau", name: "Obafemi Awolowo University" },
  { id: "ui", name: "University of Ibadan" },
];

export const users: User[] = [
  { id: "u1", username: "amaka-eze", schoolId: "fut-minna", schoolName: "FUT Minna", verifiedStudent: true, joinedAt: "2026-01-10", skills: ["Frontend", "Design", "Web3"], badgeIds: ["verified", "shipped"] },
  { id: "u2", username: "tunde-ade", schoolId: "fut-minna", schoolName: "FUT Minna", verifiedStudent: true, joinedAt: "2026-02-02", skills: ["Backend", "AI"], badgeIds: ["verified"] },
  { id: "u3", username: "kemi-obi", schoolId: "unilag", schoolName: "University of Lagos", verifiedStudent: true, joinedAt: "2026-02-20", skills: ["Solidity", "Web3"], badgeIds: ["verified"] },
  { id: "u4", username: "victory-gray", schoolId: "fut-minna", schoolName: "FUT Minna", verifiedStudent: true, joinedAt: "2026-03-01", skills: ["AI", "Data"], badgeIds: ["verified"] },
  { id: "u5", username: "chioma-n", schoolId: "fut-minna", schoolName: "FUT Minna", verifiedStudent: true, joinedAt: "2026-03-15", skills: ["Design", "Web2"], badgeIds: ["verified"] },
];

export const communities: Community[] = [
  { id: "wc", slug: "web3-club", name: "Web3 Club", blurb: "Onchain builders and learners on campus.", memberCount: 412, category: "Web3", schoolName: "FUT Minna", avatar: "WC" },
  { id: "dl", slug: "design-lab", name: "Design Lab", blurb: "UI, UX, and product design critiques and collabs.", memberCount: 188, category: "Design", schoolName: "FUT Minna", avatar: "DL" },
  { id: "cb", slug: "campus-builders", name: "Campus Builders", blurb: "Students building useful things for campus.", memberCount: 530, category: "Web2", schoolName: "FUT Minna", avatar: "CB" },
  { id: "ai", slug: "ai-circle", name: "AI Circle", blurb: "Learn, share, and demo applied AI.", memberCount: 301, category: "AI", schoolName: "FUT Minna", avatar: "AI" },
  { id: "rb", slug: "robotics", name: "Robotics", blurb: "Hardware meets software on campus.", memberCount: 96, category: "Web2", schoolName: "FUT Minna", avatar: "RB" },
  { id: "fh", slug: "founders-hub", name: "Founders Hub", blurb: "Talk ideas, teams, and launches with founders.", memberCount: 220, category: "Web2", schoolName: "FUT Minna", avatar: "FH" },
];

export const channels: Channel[] = [
  { id: "ch-general", communityId: "wc", communityName: "Web3 Club", communitySlug: "web3-club", name: "general", slug: "general", description: "Everyday chat for Web3 Club", memberCount: 412, interest: "Web3", isPublic: true, joined: true },
  { id: "ch-smart", communityId: "wc", communityName: "Web3 Club", communitySlug: "web3-club", name: "smart-contracts", slug: "smart-contracts", description: "Solidity and audits", memberCount: 160, interest: "Web3", isPublic: true, joined: true },
  { id: "ch-dapps", communityId: "wc", communityName: "Web3 Club", communitySlug: "web3-club", name: "campus-dapps", slug: "campus-dapps", description: "Talk and share campus dapp ideas", memberCount: 120, interest: "Web3", isPublic: true, joined: true },
  { id: "ch-opps", communityId: "wc", communityName: "Web3 Club", communitySlug: "web3-club", name: "opportunities", slug: "opportunities", description: "Grants, gigs, hackathons", memberCount: 300, interest: "Web3", isPublic: true, joined: false },
  { id: "ch-dl-gen", communityId: "dl", communityName: "Design Lab", communitySlug: "design-lab", name: "general", slug: "general", description: "Design chat and feedback", memberCount: 188, interest: "Design", isPublic: true, joined: true },
  { id: "ch-ai-gen", communityId: "ai", communityName: "AI Circle", communitySlug: "ai-circle", name: "general", slug: "general", description: "AI discussions and demos", memberCount: 301, interest: "AI", isPublic: true, joined: false },
  { id: "ch-cb-gen", communityId: "cb", communityName: "Campus Builders", communitySlug: "campus-builders", name: "general", slug: "general", description: "Campus builders hangout", memberCount: 530, interest: "Web2", isPublic: true, joined: false },
];

const basePerms = (postRoles: ("owner"|"moderator"|"member")[]) => ({ canPost: postRoles, canPin: ["owner","moderator"] as ("owner"|"moderator"|"member")[], canRemove: ["owner","moderator"] as ("owner"|"moderator"|"member")[] });

export const tabs: Tab[] = [
  { id: "tab-gen", channelId: "ch-general", name: "General", slug: "general", kind: "chat", fixed: "general", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 0 },
  { id: "tab-com", channelId: "ch-general", name: "Community", slug: "community", kind: "feed", fixed: "community", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 1 },
  { id: "tab-proj", channelId: "ch-general", name: "Projects", slug: "projects", kind: "board", template: "projects", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 2 },
  { id: "tab-camp", channelId: "ch-general", name: "Campaigns", slug: "campaigns", kind: "list", template: "campaigns", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 3 },

  { id: "tab-smart-g", channelId: "ch-smart", name: "General", slug: "general", kind: "chat", fixed: "general", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 0 },
  { id: "tab-smart-c", channelId: "ch-smart", name: "Community", slug: "community", kind: "feed", fixed: "community", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 1 },

  { id: "tab-dapps-g", channelId: "ch-dapps", name: "General", slug: "general", kind: "chat", fixed: "general", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 0 },
  { id: "tab-dapps-c", channelId: "ch-dapps", name: "Community", slug: "community", kind: "feed", fixed: "community", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 1 },

  { id: "tab-dl-g", channelId: "ch-dl-gen", name: "General", slug: "general", kind: "chat", fixed: "general", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 0 },
  { id: "tab-dl-c", channelId: "ch-dl-gen", name: "Community", slug: "community", kind: "feed", fixed: "community", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 1 },

  { id: "tab-ai-g", channelId: "ch-ai-gen", name: "General", slug: "general", kind: "chat", fixed: "general", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 0 },
  { id: "tab-ai-c", channelId: "ch-ai-gen", name: "Community", slug: "community", kind: "feed", fixed: "community", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 1 },
];

export const posts: Post[] = [
  { id: "p1", tabId: "tab-gen", authorId: "u1", content: "Morning everyone — who's around for the meetup later?", createdAt: "2026-11-17T08:10:00Z", channelId: "ch-general", channelName: "general", communitySlug: "web3-club", channelSlug: "general" },
  { id: "p2", tabId: "tab-gen", authorId: "u2", content: "I'll be there. Bringing a friend who's new to Web3.", createdAt: "2026-11-17T08:25:00Z", channelId: "ch-general", channelName: "general", communitySlug: "web3-club", channelSlug: "general" },
  { id: "p3", tabId: "tab-gen", authorId: "u3", content: "Can someone share the reading list again?", createdAt: "2026-11-17T09:05:00Z", channelId: "ch-general", channelName: "general", communitySlug: "web3-club", channelSlug: "general" },
  { id: "p4", tabId: "tab-com", authorId: "u3", content: "Shared: free intro-to-solidity workshop this Friday in the lab.", createdAt: "2026-11-17T12:00:00Z", pinned: true, channelId: "ch-general", channelName: "general", communitySlug: "web3-club", channelSlug: "general" },
  { id: "p5", tabId: "tab-smart-g", authorId: "u2", content: "Anyone reviewed the latest audit checklist?", createdAt: "2026-11-17T10:15:00Z", channelId: "ch-smart", channelName: "smart-contracts", communitySlug: "web3-club", channelSlug: "smart-contracts" },
  { id: "p6", tabId: "tab-smart-c", authorId: "u1", content: "Dropping notes from yesterday's contract walkthrough.", createdAt: "2026-11-17T11:00:00Z", channelId: "ch-smart", channelName: "smart-contracts", communitySlug: "web3-club", channelSlug: "smart-contracts" },
  { id: "p7", tabId: "tab-dapps-g", authorId: "u4", content: "What campus problems would a simple dapp actually solve?", createdAt: "2026-11-17T13:10:00Z", channelId: "ch-dapps", channelName: "campus-dapps", communitySlug: "web3-club", channelSlug: "campus-dapps" },
  { id: "p8", tabId: "tab-dl-g", authorId: "u5", content: "Feedback thread: drop your landing page screenshots.", createdAt: "2026-11-17T14:20:00Z", channelId: "ch-dl-gen", channelName: "general", communitySlug: "design-lab", channelSlug: "general" },
  { id: "p9", tabId: "tab-dl-c", authorId: "u1", content: "Looking for a design buddy for this week's critique.", createdAt: "2026-11-17T15:00:00Z", channelId: "ch-dl-gen", channelName: "general", communitySlug: "design-lab", channelSlug: "general" },
];

export const projects: Project[] = [
  { id: "pr1", channelId: "ch-general", tabId: "tab-proj", title: "Campus Wallet", status: "building", description: "Simple wallet onboarding for students.", needs: ["backend"], teamCount: 3, team: [{id:"u1",username:"amaka-eze"},{id:"u2",username:"tunde-ade"},{id:"u3",username:"kemi-obi"}], milestones:[{id:"m1",text:"Auth flow",done:true},{id:"m2",text:"Wallet placeholder UI",done:true},{id:"m3",text:"Pilot testers",done:false}], rolesNeeded:["backend","QA"], updates:[{id:"up1",text:"Shared login flow in channel",createdAt:"2026-11-16T10:00:00Z"}] },
];

export const campaigns: Campaign[] = [
  { id: "camp1", channelId: "ch-general", title: "Tester Drive", goal: "Get 50 student testers for Campus Wallet", endsAt: new Date(Date.now()+5*86400000).toISOString(), target: 50, joined: 32, pinned: true, status: "active", tasks:[{id:"t1",title:"Sign up and verify",points:20,done:false},{id:"t2",title:"Complete onboarding flow",points:40,done:false},{id:"t3",title:"Submit feedback form",badgeReward:"Tester drive",done:false}], leaderboard:[{rank:1,userId:"u1",username:"amaka-eze",points:60},{rank:2,userId:"u3",username:"kemi-obi",points:40},{rank:3,userId:"u2",username:"tunde-ade",points:20}] },
];

export const badges: Badge[] = [
  { id: "verified", name: "Verified student" },
  { id: "tester", name: "Tester drive" },
  { id: "hackathon", name: "Hackathon" },
  { id: "shipped", name: "Shipped" },
];

export const conversations: Conversation[] = [
  { id: "dm1", participant: { id: "u2", username: "tunde-ade" }, lastMessage: "See you at the lab by 5?", lastMessageAt: "2026-11-17T16:40:00Z", unreadCount: 2 },
  { id: "dm2", participant: { id: "u5", username: "chioma-n" }, lastMessage: "Thanks for the feedback!", lastMessageAt: "2026-11-17T12:05:00Z", unreadCount: 0 },
  { id: "dm3", participant: { id: "u4", username: "victory-gray" }, lastMessage: "You can't message this user", lastMessageAt: "2026-11-16T09:00:00Z", unreadCount: 0, blocked: true },
];

export const directMessages: DirectMessage[] = [
  { id: "m1", conversationId: "dm1", senderId: "u1", text: "Hey, are you joining the meetup?", createdAt: "2026-11-17T16:10:00Z", status: "seen" },
  { id: "m2", conversationId: "dm1", senderId: "u2", text: "Yes! I'll come with notes.", createdAt: "2026-11-17T16:20:00Z", status: "seen" },
  { id: "m3", conversationId: "dm1", senderId: "u2", text: "See you at the lab by 5?", createdAt: "2026-11-17T16:40:00Z", status: "sent" },
  { id: "m4", conversationId: "dm2", senderId: "u5", text: "Can you check my mockup?", createdAt: "2026-11-17T11:50:00Z", status: "seen" },
  { id: "m5", conversationId: "dm2", senderId: "u1", text: "Looks clean — maybe tighten spacing.", createdAt: "2026-11-17T12:00:00Z", status: "seen" },
  { id: "m6", conversationId: "dm2", senderId: "u5", text: "Thanks for the feedback!", createdAt: "2026-11-17T12:05:00Z", status: "seen" },
];

export const blockedUsers: BlockedUser[] = [{ id: "u4", username: "victory-gray" }];

export const reservedTaken = new Set(["amaka-eze","tunde-ade","kemi-obi","victory-gray","chioma-n","admin","square"]);
