export const UNIT_NAME = "community" as const;
export const UNIT_NAME_PLURAL = `${UNIT_NAME}s`;
export const ASSET_LABEL = "asset";

export function unitTitle(name: string) {
  return name;
}

export const copy = {
  login: {
    heroTitle: "Your campus, connected.",
    heroSubtitle: "Find your people. Join the communities that matter, and do what you came to do.",
    welcome: "Welcome to the Square.",
  },
  home: {
    greeting: "Good evening",
    title: "Your campus, connected",
  },
  unit: {
    name: UNIT_NAME,
    plural: UNIT_NAME_PLURAL,
    join: (name: string) => `Join ${name}`,
    joinedToast: (name: string) => `Joined ${name}`,
    find: `Find ${UNIT_NAME_PLURAL}`,
    create: `Create a ${UNIT_NAME}`,
    createTitle: `Create a ${UNIT_NAME}`,
    leave: `Leave ${UNIT_NAME}`,
    settings: `${UNIT_NAME.charAt(0).toUpperCase() + UNIT_NAME.slice(1)} settings`,
  },
} as const;
