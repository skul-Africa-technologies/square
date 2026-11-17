import type { Badge, Campaign, Channel, Community, Post, Project, School, Tab, User } from "@square/shared";

export const schools: School[] = [
  { id: "fut-minna", name: "FUT Minna" },
  { id: "unilag", name: "University of Lagos" },
  { id: "oau", name: "Obafemi Awolowo University" },
  { id: "ui", name: "University of Ibadan" },
];

export const users: User[] = [
  { id: "u1", username: "amaka-eze", schoolId: "fut-minna", schoolName: "FUT Minna", verifiedStudent: true, joinedAt: "2026-01-10", skills: ["Frontend", "Design"], badgeIds: ["verified", "shipped"] },
  { id: "u2", username: "tunde-ade", schoolId: "fut-minna", schoolName: "FUT Minna", verifiedStudent: true, joinedAt: "2026-02-02", skills: ["Backend"], badgeIds: ["verified"] },
  { id: "u3", username: "kemi-obi", schoolId: "unilag", schoolName: "University of Lagos", verifiedStudent: true, joinedAt: "2026-02-20", skills: ["Solidity"], badgeIds: ["verified","tester"] },
  { id: "u4", username: "victory-gray", schoolId: "fut-minna", schoolName: "FUT Minna", verifiedStudent: true, joinedAt: "2026-03-01", skills: ["AI"], badgeIds: ["verified"] },
];

export const communities: Community[] = [
  { id: "wc", slug: "web3-club", name: "Web3 Club", blurb: "Build and ship onchain projects with campus peers.", memberCount: 412, category: "Web3", schoolName: "FUT Minna", avatar: "WC" },
  { id: "dl", slug: "design-lab", name: "Design Lab", blurb: "UI, UX, and product design critiques and collabs.", memberCount: 188, category: "Design", schoolName: "FUT Minna", avatar: "DL" },
  { id: "cb", slug: "campus-builders", name: "Campus Builders", blurb: "Ship real products for real campus problems.", memberCount: 530, category: "Web2", schoolName: "FUT Minna", avatar: "CB" },
  { id: "ai", slug: "ai-circle", name: "AI Circle", blurb: "Learn, build, and demo applied AI.", memberCount: 301, category: "AI", schoolName: "FUT Minna", avatar: "AI" },
  { id: "rb", slug: "robotics", name: "Robotics", blurb: "Hardware meets software on campus.", memberCount: 96, category: "Web2", schoolName: "FUT Minna", avatar: "RB" },
  { id: "fh", slug: "founders-hub", name: "Founders Hub", blurb: "From idea to launch with other founders.", memberCount: 220, category: "Web2", schoolName: "FUT Minna", avatar: "FH" },
];

export const channels: Channel[] = [
  { id: "ch-general", communityId: "wc", name: "general", slug: "general", description: "Everyday chat for Web3 Club" },
  { id: "ch-smart", communityId: "wc", name: "smart-contracts", slug: "smart-contracts", description: "Solidity and audits" },
  { id: "ch-dapps", communityId: "wc", name: "campus-dapps", slug: "campus-dapps", description: "Build dapps for campus" },
  { id: "ch-opps", communityId: "wc", name: "opportunities", slug: "opportunities", description: "Grants, gigs, hackathons" },
];

const basePerms = (postRoles: ("owner"|"moderator"|"member")[]) => ({ canPost: postRoles, canPin: ["owner","moderator"] as ("owner"|"moderator"|"member")[], canRemove: ["owner","moderator"] as ("owner"|"moderator"|"member")[] });

export const tabs: Tab[] = [
  { id: "tab-gen", channelId: "ch-general", name: "General", slug: "general", kind: "chat", fixed: "general", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 0 },
  { id: "tab-com", channelId: "ch-general", name: "Community", slug: "community", kind: "feed", fixed: "community", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 1 },
  { id: "tab-ann", channelId: "ch-general", name: "Announcements", slug: "announcements", kind: "feed", template: "announcements", enabled: true, permissions: basePerms(["owner","moderator"]), order: 2 },
  { id: "tab-proj", channelId: "ch-general", name: "Projects", slug: "projects", kind: "board", template: "projects", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 3 },
  { id: "tab-camp", channelId: "ch-general", name: "Campaigns", slug: "campaigns", kind: "list", template: "campaigns", enabled: true, permissions: basePerms(["owner","moderator","member"]), order: 4 },
];

export const posts: Post[] = [
  { id: "p1", tabId: "tab-gen", authorId: "u1", content: "Anyone up for pairing on the campus wallet flow tonight?", createdAt: "2026-11-17T18:10:00Z" },
  { id: "p2", tabId: "tab-gen", authorId: "u2", content: "I can review contracts after 7pm. Drop links here.", createdAt: "2026-11-17T18:25:00Z" },
  { id: "p3", tabId: "tab-com", authorId: "u3", content: "Promo: Tester Drive is live — help us hit 50 testers this week.", createdAt: "2026-11-17T12:00:00Z", pinned: true },
];

export const projects: Project[] = [
  { id: "pr1", channelId: "ch-general", tabId: "tab-proj", title: "Campus Wallet", status: "building", description: "Simple wallet onboarding for students.", needs: ["backend"], teamCount: 3, team: [{id:"u1",username:"amaka-eze"},{id:"u2",username:"tunde-ade"},{id:"u3",username:"kemi-obi"}], milestones:[{id:"m1",text:"Auth flow",done:true},{id:"m2",text:"Wallet placeholder UI",done:true},{id:"m3",text:"Pilot testers",done:false}], rolesNeeded:["backend","QA"], updates:[{id:"up1",text:"Shipped login mock flow",createdAt:"2026-11-16T10:00:00Z"}] },
  { id: "pr2", channelId: "ch-general", tabId: "tab-proj", title: "DAO Voting Kit", status: "idea", description: "Templates for campus DAO proposals.", needs: ["design"], teamCount: 1, team:[{id:"u4",username:"victory-gray"}], milestones:[{id:"m1",text:"Scope",done:false}], rolesNeeded:["design","frontend"], updates:[] },
  { id: "pr3", channelId: "ch-general", tabId: "tab-proj", title: "Event Check-in", status: "launched", description: "QR check-in for campus events.", needs: [], teamCount: 4, team:[{id:"u1",username:"amaka-eze"}], milestones:[{id:"m1",text:"Launch",done:true}], rolesNeeded:[], updates:[{id:"up1",text:"Shipped v1",createdAt:"2026-11-10T10:00:00Z"}], shippedRecord: "Live at 3 events" },
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

export const reservedTaken = new Set(["amaka-eze","tunde-ade","kemi-obi","victory-gray","admin","square"]);
