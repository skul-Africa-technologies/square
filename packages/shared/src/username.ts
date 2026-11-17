export const USERNAME_RULES = {
  minVisible: 4, // including "#", so 3+ visible name characters
  maxVisible: 24,
  prefix: "#",
  // letters (with combining marks) and emoji sequences (incl. skin tones, ZWJ, variation selectors), single hyphens between words
  pattern: /^#[\p{L}\p{M}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0F]+(-[\p{L}\p{M}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0F]+)*$/u,
  // stored lowercase without "#"
} as const;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function visibleLength(value: string): number {
  return Array.from(segmenter.segment(value)).length;
}

export function normalizeUsernameInput(input: string): string {
  // keep user-entered chars except leading # handling for display logic; storage lowercases and strips #
  return input.trim();
}

export function toStoredUsername(displayOrInput: string): string {
  const v = normalizeUsernameInput(displayOrInput);
  return (v.startsWith("#") ? v.slice(1) : v).toLowerCase();
}

export function toDisplayUsername(stored: string): string {
  const clean = stored.startsWith("#") ? stored.slice(1) : stored;
  return `#${clean}`;
}

export type UsernameValidation = { ok: true; stored: string } | { ok: false; reason: string };

export function validateUsername(input: string): UsernameValidation {
  const v = normalizeUsernameInput(input);
  const withHash = v.startsWith("#") ? v : `#${v}`;
  if (!USERNAME_RULES.pattern.test(withHash)) {
    return { ok: false, reason: "Only letters and emoji, single hyphens between words" };
  }
  const len = visibleLength(withHash);
  if (len < USERNAME_RULES.minVisible || len > USERNAME_RULES.maxVisible) {
    return { ok: false, reason: `Must be ${USERNAME_RULES.minVisible}-${USERNAME_RULES.maxVisible} visible characters` };
  }
  const stored = toStoredUsername(withHash);
  return { ok: true, stored };
}
