# Redesign changes

- `frontend/app/globals.css` — Replaced the app palette with the redesign tokens and added the 84px desktop rail, 62px mobile rail, 250px side panel, and curved panel edges.
- `frontend/components/ui/redesign.tsx` — Added shared HexBadge, unread ratio, CountBadge, RobotAvatar, AngleButton, CurvedPanel, and FilterMenu components.
- `frontend/components/shell/CommunityStrip.tsx` — Switched community, home, create, and explore rail controls to HexBadges and unread ring ratios.
- `frontend/features/dm/MessagesPanel.tsx` — Replaced DM circular initials and old presence dots with RobotAvatar tiles and count badges.
- `frontend/features/communities/ExploreView.tsx` — Replaced category chips with the filter menu and community cards with compact rows.
- `frontend/features/home/HomeHub.tsx` and `frontend/features/home/MobileHomeHub.tsx` — Replaced discover-page community suggestion banners and circular avatars with compact HexBadge cards and AngleButton join controls.
- `frontend/features/home/HomeHub.tsx` and `frontend/features/home/MobileHomeHub.tsx` — Redesigned desktop and mobile birthday celebrant and upcoming-event panels, with cake badges on celebrant avatars and width-safe compact rows.
- `frontend/features/dm/MobileHub.tsx`, `frontend/features/dm/ConversationsView.tsx`, `frontend/features/dm/MessagesPanel.tsx`, `frontend/features/dm/ThreadView.tsx`, `frontend/features/dm/ThreadScreen.tsx`, `frontend/components/shell/UserPanel.tsx`, and `frontend/components/messages/MessageRow.tsx` — Replaced circular DM and current-user initials with RobotAvatar squircle tiles and CountBadge unread indicators.
- `frontend/features/home/MobileHomeHub.tsx` — Updated the mobile Discover Messages tab, including Recent and Direct Messages, to use RobotAvatar squircle tiles and CountBadge unread indicators.
- `frontend/features/auth/LoginFlow.tsx` — Changed the verification code control to a six-column grid for 320px-safe wrapping.
