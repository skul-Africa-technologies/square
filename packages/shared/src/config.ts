export const config = {
  // Open questions defaults (single config flags)
  restrictCommunityCreationToVerifiedStudents: false, // default: anyone can create communities
  allowModeratorsToAddCustomTabs: false, // default: only owners can add custom tabs
  communityTabMembersCanPost: true,
  communityTabModeratorsCanPinRemove: true,
  enforceMinimumAgeFrontend: false,
  usernamesChangeableInUi: false,
} as const;
