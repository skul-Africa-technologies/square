export const config = {
  // Open questions defaults (single config flags)
  restrictCommunityCreationToVerifiedStudents: false, // default: anyone can create communities
  ALLOW_CUSTOM_ASSETS: false,
  communityAssetMembersCanPost: true,
  communityAssetModeratorsCanPinRemove: true,
  enforceMinimumAgeFrontend: false,
  usernamesChangeableInUi: false,
  GROUP_CONSECUTIVE_MESSAGES: true, // group consecutive same-author messages within 5 minutes
} as const;
