import type { Asset, AssetItem, Activity, Badge, BlockedUser, Campaign, Community, Conversation, DirectMessage, Post, Project, Role, School, User } from "@square/shared";
import { DEFAULT_ASSETS, ASSET_CATALOG } from "@square/shared";

export const schools: School[] = [
  { id: "fut-minna", name: "FUT Minna" },
  { id: "unilag", name: "University of Lagos" },
  { id: "oau", name: "Obafemi Awolowo University" },
  { id: "ui", name: "University of Ibadan" },
];

const today = new Date();
const todayMonthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

const grad = (a: string, b: string) => `linear-gradient(135deg, ${a}, ${b})`;

export const users: User[] = [
  { id: "u1", username: "amaka-eze", displayName: "Amaka Eze", schoolId: "fut-minna", schoolName: "FUT Minna", verifiedStudent: true, joinedAt: "2026-01-10", skills: ["Frontend", "Design", "Web3"], badgeIds: ["verified", "shipped"], presence: "online", dob: `2000-${todayMonthDay}`, showBirthday: true, joinedCommunitySlugs: ["web3-club", "design-lab", "ai-circle"], status: "Building campus products.", department: "Computer Science", level: "300", bannerUrl: grad("#1d2a10", "#0b0d0b"), links: [{ label: "GitHub", url: "https://github.com/amaka-eze" }, { label: "X", url: "https://x.com/amaka-eze" }], location: "Minna, Nigeria", languages: ["English", "Hausa"] },
  { id: "u2", username: "tunde-ade", displayName: "Tunde Ade", schoolId: "fut-minna", schoolName: "FUT Minna", verifiedStudent: true, joinedAt: "2026-02-02", skills: ["Backend", "AI"], badgeIds: ["verified"], presence: "online", dob: "1999-03-15", showBirthday: true, joinedCommunitySlugs: ["web3-club", "design-lab", "ai-circle", "campus-builders", "robotics"], status: "Open to collabs.", department: "Computer Science", level: "400", bannerUrl: grad("#152219", "#0b0d0b"), links: [{ label: "GitHub", url: "https://github.com/tunde-ade" }], location: "Minna, Nigeria", languages: ["English", "Yoruba"] },
  { id: "u3", username: "kemi-obi", displayName: "Kemi Obi", schoolId: "unilag", schoolName: "University of Lagos", verifiedStudent: true, joinedAt: "2026-02-20", skills: ["Solidity", "Web3"], badgeIds: ["verified"], presence: "offline", dob: "2001-07-22", showBirthday: false, joinedCommunitySlugs: ["web3-club", "founders-hub"], status: undefined, department: "Electrical Engineering", level: "200", bannerUrl: grad("#12251b", "#0b0d0b"), links: [], location: "Lagos, Nigeria", languages: ["English", "Yoruba"] },
  { id: "u4", username: "victory-gray", displayName: "Victory Gray", schoolId: "fut-minna", schoolName: "FUT Minna", verifiedStudent: true, joinedAt: "2026-03-01", skills: ["AI", "Data"], badgeIds: ["verified"], presence: "hidden", dob: `2000-${todayMonthDay}`, showBirthday: false, joinedCommunitySlugs: ["ai-circle", "web3-club"], status: "Appear offline mode.", department: "Data Science", level: "300", bannerUrl: grad("#20200f", "#0b0d0b"), links: [{ label: "Website", url: "https://victorygray.dev" }], location: "Abuja, Nigeria", languages: ["English"] },
  { id: "u5", username: "chioma-n", displayName: "Chioma N", schoolId: "fut-minna", schoolName: "FUT Minna", verifiedStudent: true, joinedAt: "2026-03-15", skills: ["Design", "Web2"], badgeIds: ["verified"], presence: "online", dob: "2002-11-05", showBirthday: true, joinedCommunitySlugs: ["design-lab", "web3-club", "debate-society", "photography-club"], status: "Designing tomorrow.", department: "Visual Arts", level: "300", bannerUrl: grad("#231a12", "#0b0d0b"), links: [{ label: "X", url: "https://x.com/chioma-n" }, { label: "LinkedIn", url: "https://linkedin.com/in/chioma-n" }], location: "Minna, Nigeria", languages: ["English", "Igbo"] },
  { id: "u6", username: "sam-okoro", displayName: "Sam Okoro", schoolId: "fut-minna", schoolName: "FUT Minna", verifiedStudent: true, joinedAt: "2026-03-20", skills: ["Robotics"], badgeIds: ["verified"], presence: "offline", dob: "2001-09-30", showBirthday: true, joinedCommunitySlugs: ["robotics", "web3-club", "campus-builders"], status: undefined, department: "Mechanical Engineering", level: "400", bannerUrl: grad("#1a102a", "#0b0d0b"), links: [], location: "Minna, Nigeria", languages: ["English"] },
  { id: "u7", username: "zainab-b", displayName: "Zainab B", schoolId: "fut-minna", schoolName: "FUT Minna", verifiedStudent: true, joinedAt: "2026-04-01", skills: ["Writing"], badgeIds: ["verified"], presence: "online", dob: `2000-${todayMonthDay}`, showBirthday: true, joinedCommunitySlugs: ["debate-society", "founders-hub", "design-lab", "web3-club"], status: "Writer and founder.", department: "English", level: "200", bannerUrl: grad("#1d2a10", "#0b0d0b"), links: [{ label: "Website", url: "https://zainab-b.dev" }], location: "Ibadan, Nigeria", languages: ["English", "Yoruba"] },
  { id: "u8", username: "david-k", displayName: "David K", schoolId: "fut-minna", schoolName: "FUT Minna", verifiedStudent: true, joinedAt: "2026-04-11", skills: ["Photography"], badgeIds: ["verified"], presence: "online", dob: "2002-01-18", showBirthday: true, joinedCommunitySlugs: ["photography-club", "design-lab", "web3-club"], status: "Capturing moments.", department: "Mass Comm", level: "300", bannerUrl: grad("#231a12", "#0b0d0b"), links: [{ label: "Instagram", url: "https://instagram.com/david-k" }], location: "Minna, Nigeria", languages: ["English"] },
  { id: "u9", username: "abcdefghij-klmnopqrstuv", schoolId: "fut-minna", schoolName: "FUT Minna", verifiedStudent: true, joinedAt: "2026-05-01", skills: [], badgeIds: [], presence: "online", dob: "2000-01-01", showBirthday: false, joinedCommunitySlugs: [], status: undefined, department: "General Studies", level: "100", bannerUrl: undefined, links: [], location: "Minna, Nigeria", languages: ["English"] },
  { id: "u10", username: "long-school-student", schoolId: "fut-minna", schoolName: "A Very Long Indeed School Name That Exceeds Reasonable Length For Testing Truncation Behavior", verifiedStudent: true, joinedAt: "2026-05-02", skills: ["Design"], badgeIds: [], presence: "online", dob: "2000-02-02", showBirthday: false, joinedCommunitySlugs: [], status: undefined, department: "Design", level: "100", bannerUrl: undefined, links: [], location: "Minna, Nigeria", languages: ["English"] },
];

export const communities: Community[] = [
  { id: "wc", slug: "web3-club", name: "Web3 Club", blurb: "Onchain builders and learners on campus.", memberCount: 4120, category: "Web3", categories: ["Web3", "Code"], schoolName: "FUT Minna", avatar: "WC", joined: true, role: "member", onlineCount: 34, bannerUrl: grad("#1d2a10", "#0b0d0b") },
  { id: "dl", slug: "design-lab", name: "Design Lab", blurb: "UI, UX, and product design critiques and collabs.", memberCount: 1880, category: "Design", categories: ["Design", "Critique"], schoolName: "FUT Minna", avatar: "DL", joined: true, role: "member", onlineCount: 12, bannerUrl: grad("#152219", "#0b0d0b") },
  { id: "cb", slug: "campus-builders", name: "Campus Builders", blurb: "Students building useful things for campus.", memberCount: 5300, category: "Web2", categories: ["Web2", "Product"], schoolName: "FUT Minna", avatar: "CB", joined: false, role: null, onlineCount: 41, bannerUrl: grad("#12251b", "#0b0d0b") },
  { id: "ai", slug: "ai-circle", name: "AI Circle", blurb: "Learn, share, and demo applied AI.", memberCount: 3010, category: "AI", categories: ["AI", "Demos"], schoolName: "FUT Minna", avatar: "AI", joined: true, role: "member", onlineCount: 22 },
  { id: "rb", slug: "robotics", name: "Robotics", blurb: "Hardware meets software on campus.", memberCount: 960, category: "Web2", categories: ["Robotics", "Hardware"], schoolName: "FUT Minna", avatar: "RB", joined: false, role: null, onlineCount: 7 },
  { id: "fh", slug: "founders-hub", name: "Founders Hub", blurb: "Talk ideas, teams, and launches with founders.", memberCount: 2200, category: "Web2", categories: ["Startups", "Product"], schoolName: "FUT Minna", avatar: "FH", joined: false, role: null, onlineCount: 15, bannerUrl: grad("#20200f", "#0b0d0b") },
  { id: "ds", slug: "debate-society", name: "Debate Society", blurb: "Arguments that sharpen thinking.", memberCount: 740, category: "Writing", categories: ["Writing", "Speaking"], schoolName: "FUT Minna", avatar: "DS", joined: false, role: null, onlineCount: 4 },
  { id: "pc", slug: "photography-club", name: "Photography Club", blurb: "Walks, edits, and critiques.", memberCount: 610, category: "Design", categories: ["Design", "Photography"], schoolName: "FUT Minna", avatar: "PC", joined: false, role: null, onlineCount: 3, bannerUrl: grad("#231a12", "#0b0d0b") },
  { id: "gc", slug: "gaming-collective", name: "Gaming Collective", blurb: "Esports, game dev, and late-night lobbies.", memberCount: 2800, category: "Web2", categories: ["Gaming", "Esports"], schoolName: "FUT Minna", avatar: "GC", joined: false, role: null, onlineCount: 56, bannerUrl: grad("#1a102a", "#0b0d0b") },
  { id: "mc", slug: "music-circle", name: "Music Circle", blurb: "Production, theory, and jam sessions.", memberCount: 1340, category: "Arts", categories: ["Music", "Production"], schoolName: "FUT Minna", avatar: "MC", joined: false, role: null, onlineCount: 18 },
  { id: "big", slug: "big-community", name: "Big Community", blurb: "A very large community for testing member count truncation.", memberCount: 12345, category: "Web2", categories: ["Web2", "Product"], schoolName: "FUT Minna", avatar: "BC", joined: false, role: null, onlineCount: 120 },
];

const templates: Record<string, string> = { announcements: "announcements", guidelines: "guidelines", events: "events", opportunities: "opportunities", resources: "resources", projects: "projects", campaigns: "campaigns", hackathons: "hackathons", tournaments: "tournaments", "game-dev": "game-dev", lfg: "lfg", productions: "productions", theory: "theory", collabs: "collabs" };

function buildAsset(communityId: string, entryKey: string, order: number): Asset {
  const entry = [...DEFAULT_ASSETS, ...ASSET_CATALOG].find(a => a.key === entryKey);
  if (!entry) throw new Error(`Unknown catalog entry ${entryKey}`);
  return {
    id: `${communityId}-${entry.key}`,
    communityId,
    name: entry.name,
    slug: entry.name,
    description: entry.description,
    kind: entry.kind,
    category: entry.category,
    template: templates[entry.key],
    permissions: entry.permissions,
    isDefault: !!entry.isDefault,
    catalogKey: entry.key,
    order,
    hiddenFromMembers: entry.hiddenFromMembers,
    unreadCount: 0,
    lastReadPostId: null,
  };
}

const defaultKeys = DEFAULT_ASSETS.map(a => a.key);
const extras: Record<string, string[]> = {
  wc: ["support", "opportunities", "projects", "mods-only"],
  dl: ["showcase", "feedback"],
  ai: ["showcase", "resources"],
  cb: ["introductions", "showcase"],
  rb: ["support"],
  fh: ["introductions", "opportunities"],
  ds: ["off-topic"],
  pc: ["showcase"],
  gc: ["tournaments", "game-dev", "lfg"],
  mc: ["productions", "theory", "collabs"],
};

export const assets: Asset[] = communities.flatMap(c => {
  const keys = [...defaultKeys, ...(extras[c.id] || [])];
  return keys.map((key, i) => buildAsset(c.id, key, i));
});

function unread(assetId: string, count: number) {
  const a = assets.find(x => x.id === assetId);
  if (a) a.unreadCount = count;
}

export const memberships: Record<string, { userId: string; role: Role }[]> = {
  wc: [
    { userId: "u3", role: "owner" },
    { userId: "u1", role: "moderator" },
    { userId: "u2", role: "member" },
    { userId: "u5", role: "member" },
    { userId: "u6", role: "member" },
    { userId: "u7", role: "member" },
    { userId: "u8", role: "member" },
    { userId: "u4", role: "member" },
  ],
  dl: [
    { userId: "u1", role: "owner" },
    { userId: "u5", role: "member" },
    { userId: "u2", role: "member" },
    { userId: "u8", role: "member" },
  ],
  ai: [
    { userId: "u4", role: "owner" },
    { userId: "u2", role: "moderator" },
    { userId: "u1", role: "member" },
  ],
  cb: [
    { userId: "u2", role: "owner" },
    { userId: "u7", role: "moderator" },
    { userId: "u6", role: "member" },
  ],
  rb: [
    { userId: "u6", role: "owner" },
    { userId: "u2", role: "member" },
  ],
  fh: [
    { userId: "u7", role: "owner" },
    { userId: "u3", role: "member" },
  ],
  ds: [
    { userId: "u7", role: "owner" },
    { userId: "u5", role: "member" },
  ],
  pc: [
    { userId: "u8", role: "owner" },
    { userId: "u5", role: "member" },
  ],
  gc: [
    { userId: "u2", role: "owner" },
    { userId: "u1", role: "moderator" },
    { userId: "u6", role: "member" },
  ],
  mc: [
    { userId: "u5", role: "owner" },
    { userId: "u1", role: "member" },
  ],
};

const now = Date.now();
const ago = (mins: number) => new Date(now - mins * 60000).toISOString();

function post(id: string, assetId: string, authorId: string, content: string, mins: number, extra: Partial<Post> = {}): Post {
  const asset = assets.find(a => a.id === assetId);
  const community = communities.find(c => c.id === asset?.communityId);
  const author = users.find(u => u.id === authorId);
  return {
    id, assetId, authorId, authorUsername: author?.username, content, createdAt: ago(mins),
    communityId: community?.id, communityName: community?.name, communitySlug: community?.slug,
    assetName: asset?.name, assetSlug: asset?.slug, ...extra,
  };
}

const reactions = (items: Array<[string, number, boolean?]>) =>
  items.map(([emoji, count, me = false]) => ({ emoji, count, me }));

export const posts: Post[] = [
  post("p1", "wc-general", "u1", "Morning everyone — who's reviewing contracts later?", 60 * 26, { reactions: reactions([["👍", 3]]) }),
  post("p1b", "wc-general", "u1", "I can share notes from yesterday if helpful.", 60 * 25),
  post("p2", "wc-general", "u2", "I'll be there. Bringing a friend who's new to Web3.", 60 * 24, { replyToId: "p1", replyPreview: { id: "p1", authorUsername: "amaka-eze", snippet: "Morning everyone — who's reviewing contracts later?" }, reactions: reactions([["❤️", 2], ["🔥", 4, true], ["👀", 1]]) }),
  post("p3", "wc-general", "u3", "Can someone share the reading list again?", 180, { reactions: reactions([["👍", 2], ["❤️", 4], ["😂", 1], ["🔥", 3], ["🎉", 2], ["👀", 1], ["🙏", 2], ["✅", 1], ["⭐", 2]]) }),
  post("p4", "wc-general", "u4", "There is a free intro-to-solidity workshop this Friday in the lab.", 150),
  post("p5", "wc-general", "u5", "Adding it to the events asset now.", 140),
  post("p6", "wc-general", "u6", "Anyone bringing a laptop with Foundry installed?", 120),
  post("p7", "wc-general", "u1", "I have it. Happy to help with setup.", 110),
  post("p8", "wc-general", "u2", "Same here.", 100),
  post("p9", "wc-general", "u3", "Great, see everyone Friday.", 90),
  post("p10", "wc-general", "u7", "Notes from last week are in #resources.", 80, { replyToId: "p3", replyPreview: { id: "p3", authorUsername: "kemi-obi", snippet: "Can someone share the reading list again?" } }),
  post("p11", "wc-general", "u8", "Thanks Zainab!", 70),
  post("p12", "wc-general", "u5", "Reminder: bring your own power strip.", 60),
  post("p13", "wc-general", "u1", "Also: the workshop needs two more helpers.", 45),
  post("p14", "wc-general", "u2", "Huge thanks to @amaka-eze for organizing the notes!", 30, {
    mentionedUserIds: ["u1"],
    reactions: reactions([["👍", 1], ["❤️", 1], ["😂", 1], ["🔥", 1], ["🎉", 1], ["👀", 1], ["🙏", 1], ["✅", 1], ["⭐", 1], ["💯", 1], ["🚀", 1], ["💡", 1], ["👏", 1], ["🤝", 1], ["🌟", 1], ["🥳", 1], ["💪", 1], ["😎", 1], ["🫶", 1], ["🎯", 1]]) }),
  ...Array.from({ length: 40 }, (_, index) => post(
    `p-long-${index + 1}`, "wc-general", ["u2", "u3", "u5", "u6"][index % 4],
    index === 20 ? "Web3 Club update: @amaka-eze, can you review this?" : `Web3 Club chat update ${index + 1}`,
    29 - index * 0.6,
    index === 20 ? { mentionedUserIds: ["u1"] } : {},
  )),

  post("p20", "wc-announcements", "u3", "Welcome to Web3 Club. Start in #general and say hello.", 60 * 48, { pinned: true, mentionedUserIds: ["u1"] }),
  post("p21", "wc-announcements", "u2", "Workshop sign-ups close Thursday at noon.", 60 * 12),

  post("p22", "wc-guidelines", "u3", "Be kind. Stay on topic in #general. Ask in #support when stuck.", 60 * 72, { pinned: true }),

  post("p23", "wc-support", "u6", "My test transactions keep failing. Any ideas?", 200),
  post("p24", "wc-support", "u1", "Check you are on the right chain and have gas.", 195),
  post("p25", "wc-support", "u6", "That was it, thank you.", 190),

  post("p30", "dl-general", "u5", "Feedback Friday: drop one screen you want critiqued.", 60 * 20),
  post("p31", "dl-general", "u1", "Landing page hero — too much copy on mobile.", 60 * 19),
  post("p32", "dl-general", "u5", "Agreed. Cut the second paragraph.", 60 * 18),

  post("p33", "dl-feedback", "u8", "Portfolio walkthrough at 4pm?", 60 * 6),

  post("p40", "ai-general", "u4", "Demo night theme: tiny tools that save 10 minutes a day.", 30),
  post("p41", "ai-general", "u2", "I built a note triage bot.", 25),

  post("p50", "cb-general", "u2", "What are you shipping this semester?", 60 * 5),
  post("p51", "cb-general", "u7", "A timetable planner with no login required.", 60 * 4),

  post("p60", "rb-general", "u6", "Servo arrived. Testing the arm this weekend.", 60 * 30),

  post("p70", "fh-general", "u7", "Pitch practice Thursday, 6pm. Bring one slide.", 60 * 8),

  post("p80", "ds-general", "u5", "Motion debate topic this week: campus tech fees.", 60 * 9),

  post("p90", "pc-general", "u8", "Sunset walk around the lake at 5:30.", 60 * 11),
];

unread("wc-general", 12);
unread("wc-announcements", 1);
unread("wc-support", 3);
unread("dl-general", 2);

export const projects: Project[] = [
  { id: "pr1", assetId: "wc-projects", communityId: "wc", title: "Campus Wallet", status: "building", description: "Simple wallet onboarding for students.", needs: ["backend"], teamCount: 3, team: [{ id: "u1", username: "amaka-eze" }, { id: "u2", username: "tunde-ade" }, { id: "u3", username: "kemi-obi" }], milestones: [{ id: "m1", text: "Auth flow", done: true }, { id: "m2", text: "Wallet placeholder UI", done: true }, { id: "m3", text: "Pilot testers", done: false }], rolesNeeded: ["backend", "QA"], updates: [{ id: "up1", text: "Shared login flow in the community", createdAt: "2026-11-16T10:00:00Z" }] },
  { id: "pr2", assetId: "dl-projects", communityId: "dl", title: "Campus Chronicle", status: "idea", description: "Student-run publication and blog platform.", needs: ["writers", "editors"], teamCount: 2, team: [{ id: "u7", username: "zainab-b" }], milestones: [{ id: "m1", text: "Editorial calendar", done: false }], rolesNeeded: ["writers"], updates: [] },
  { id: "pr3", assetId: "rb-projects", communityId: "rb", title: "Line-follower robot", status: "launched", description: "Autonomous line-following robot for the robotics lab.", needs: ["firmware"], teamCount: 2, team: [{ id: "u6", username: "sam-okoro" }, { id: "u2", username: "tunde-ade" }], milestones: [{ id: "m1", text: "Chassis build", done: true }, { id: "m2", text: "Sensor calibration", done: true }], rolesNeeded: ["firmware"], updates: [{ id: "up1", text: "First successful run", createdAt: "2026-10-01T00:00:00Z" }] },
];

export const campaigns: Campaign[] = [];

export const activities: Activity[] = [
  { id: "a1", type: "badge", actorUsername: "amaka-eze", text: "earned the Shipped badge", createdAt: "2026-04-20T10:00:00Z", badge: "Shipped" },
  { id: "a2", type: "community", actorUsername: "amaka-eze", text: "joined Campus Builders", createdAt: "2026-02-10T09:00:00Z", community: "Campus Builders" },
  { id: "a3", type: "project", actorUsername: "amaka-eze", text: "shipped Campus Wallet", createdAt: "2026-04-05T14:00:00Z", project: "Campus Wallet" },
  { id: "a5", type: "community", actorUsername: "chioma-n", text: "joined Design Lab", createdAt: "2026-03-15T09:30:00Z", community: "Design Lab" },
  { id: "a6", type: "project", actorUsername: "zainab-b", text: "started a writing project", createdAt: "2026-04-01T16:00:00Z", project: "Campus Chronicle" },
  { id: "a7", type: "badge", actorUsername: "david-k", text: "earned the Tester drive badge", createdAt: "2026-04-11T10:30:00Z", badge: "Tester drive" },
  { id: "a8", type: "community", actorUsername: "sam-okoro", text: "joined Robotics", createdAt: "2026-03-20T08:00:00Z", community: "Robotics" },
];

export const items: AssetItem[] = [
  { id: "i1", assetId: "wc-events", title: "Intro to Solidity workshop", description: "Bring a laptop with Foundry installed.", date: new Date(now + 3 * 86400000).toISOString(), place: "Computer Lab 2", link: "https://example.com/workshop", createdAt: ago(60 * 24), createdBy: "u2" },
  { id: "i2", assetId: "wc-events", title: "Campus build night", description: "Open build session for all levels.", date: new Date(now + 9 * 86400000).toISOString(), place: "Innovation Hub", createdAt: ago(60 * 30), createdBy: "u3" },
  { id: "i3", assetId: "wc-opportunities", title: "Student builder grant", description: "Up to $500 for campus tools.", link: "https://example.com/grant", createdAt: ago(300), createdBy: "u7" },
  { id: "i4", assetId: "wc-opportunities", title: "Web3 internship — remote", description: "Part-time, open to final-year students.", link: "https://example.com/internship", createdAt: ago(600), createdBy: "u3" },
  { id: "i5", assetId: "wc-guidelines", title: "Community expectations", description: "Be kind. Stay on topic. Ask for help in #support.", createdAt: ago(60 * 72), createdBy: "u3" },
  { id: "i6", assetId: "wc-announcements", title: "Workshop sign-ups", description: "Closes Thursday at noon.", createdAt: ago(60 * 12), createdBy: "u2" },
];

export const badges: Badge[] = [
  { id: "tester", name: "Tester drive", icon: "bug", earnedAt: "2026-02-15", rarity: "uncommon" },
  { id: "hackathon", name: "Hackathon", icon: "trophy", earnedAt: "2026-03-05", rarity: "rare" },
  { id: "shipped", name: "Shipped", icon: "rocket", earnedAt: "2026-04-20", rarity: "uncommon" },
  { id: "mentor", name: "Mentor", icon: "handshake", earnedAt: "2026-05-12", rarity: "rare" },
  { id: "flame", name: "Hot streak", icon: "flame", earnedAt: "2026-06-01", rarity: "uncommon" },
  { id: "star", name: "Star builder", icon: "star", earnedAt: "2026-07-10", rarity: "legendary" },
  { id: "leader", name: "Community leader", icon: "users", earnedAt: "2026-08-18", rarity: "rare" },
];

export const conversations: Conversation[] = [
  { id: "dm1", participant: { id: "u2", username: "tunde-ade" }, otherUserId: "u2", lastMessage: "See you at the lab by 5?", lastMessagePreview: "See you at the lab by 5?", lastMessageAt: ago(4), unreadCount: 2, presence: "online" },
  { id: "dm2", participant: { id: "u5", username: "chioma-n" }, otherUserId: "u5", lastMessage: "Thanks for the feedback!", lastMessagePreview: "Thanks for the feedback!", lastMessageAt: ago(96), unreadCount: 0, presence: "online" },
  { id: "dm3", participant: { id: "u4", username: "victory-gray" }, otherUserId: "u4", lastMessage: "You can't message this user", lastMessagePreview: "You can't message this user", lastMessageAt: ago(60 * 26), unreadCount: 0, blocked: true, presence: "hidden" },
  { id: "dm4", participant: { id: "u7", username: "zainab-b" }, otherUserId: "u7", lastMessage: "Sending the draft tonight.", lastMessagePreview: "Sending the draft tonight.", lastMessageAt: ago(60 * 5), unreadCount: 1, presence: "online" },
  { id: "dm5", participant: { id: "u6", username: "sam-okoro" }, otherUserId: "u6", lastMessage: "The servo arrived, testing later.", lastMessagePreview: "The servo arrived, testing later.", lastMessageAt: ago(60 * 30), unreadCount: 0, presence: "offline" },
  { id: "dm6", participant: { id: "u8", username: "david-k" }, otherUserId: "u8", lastMessage: "Photos from the walk are up.", lastMessagePreview: "Photos from the walk are up.", lastMessageAt: ago(60 * 24 * 9), unreadCount: 0, presence: "online" },
  { id: "dm7", participant: { id: "u3", username: "kemi-obi" }, otherUserId: "u3", lastMessage: "Can you check this too, @amaka-eze?", lastMessagePreview: "Can you check this too, @amaka-eze?", lastMessageAt: ago(6), unreadCount: 2, presence: "offline" },
];

export const directMessages: DirectMessage[] = [
  { id: "m1", conversationId: "dm1", senderId: "u1", text: "Hey, are you joining the meetup?", createdAt: ago(30), status: "seen", reactions: reactions([["👍", 2, true]]) },
  { id: "m1b", conversationId: "dm1", senderId: "u1", text: "I can save us seats.", createdAt: ago(29), status: "seen" },
  { id: "m2", conversationId: "dm1", senderId: "u2", text: "Yes! I'll come with notes.", createdAt: ago(20), status: "seen", replyToId: "m1", replyPreview: { id: "m1", authorUsername: "amaka-eze", snippet: "Hey, are you joining the meetup?" }, reactions: reactions([["🙌", 3], ["✨", 1]]) },
  { id: "m3", conversationId: "dm1", senderId: "u2", text: "See you at the lab by 5, @amaka-eze?", createdAt: ago(4), status: "sent", mentionedUserIds: ["u1"], reactions: reactions([["👍", 1], ["❤️", 1, true], ["😂", 2]]) },
  ...Array.from({ length: 40 }, (_, index): DirectMessage => ({
    id: `m-long-${index + 1}`, conversationId: "dm1", senderId: "u2",
    text: `Follow-up message ${index + 1}`, createdAt: ago(3 - index * 0.05), status: "sent",
  })),
  { id: "m4", conversationId: "dm2", senderId: "u5", text: "Can you check my mockup?", createdAt: ago(110), status: "seen" },
  { id: "m5", conversationId: "dm2", senderId: "u1", text: "Looks clean — maybe tighten spacing.", createdAt: ago(100), status: "seen" },
  { id: "m6", conversationId: "dm2", senderId: "u5", text: "Thanks for the feedback!", createdAt: ago(96), status: "seen" },
  { id: "m7", conversationId: "dm4", senderId: "u7", text: "Sending the draft tonight.", createdAt: ago(60 * 5), status: "sent" },
  { id: "m9", conversationId: "dm7", senderId: "u3", text: "First note for you, @amaka-eze.", createdAt: ago(7), status: "sent", mentionedUserIds: ["u1"] },
  { id: "m10", conversationId: "dm7", senderId: "u3", text: "Can you check this too, @amaka-eze?", createdAt: ago(6), status: "sent", mentionedUserIds: ["u1"] },
  { id: "m8", conversationId: "dm5", senderId: "u6", text: "The servo arrived, testing later.", createdAt: ago(60 * 30), status: "seen" },
];

export const blockedUsers: BlockedUser[] = [{ id: "u4", username: "victory-gray" }];

export const reservedTaken = new Set(["amaka-eze","tunde-ade","kemi-obi","victory-gray","chioma-n","admin","square"]);
