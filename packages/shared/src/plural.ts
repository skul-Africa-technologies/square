/**
 * Plural helper using Intl.PluralRules.
 *
 * Usage:
 *   plural(1, "community", "communities")  → "1 community"
 *   plural(4, "community", "communities")  → "4 communities"
 *   plural(1, "member")                    → "1 member"  (adds "s" for plural)
 *   plural(2, "member")                    → "2 members"
 */

const _rules = new Intl.PluralRules("en");

/**
 * Returns "N word" or "N words" (using `pluralForm` if supplied, otherwise
 * appending "s" to `singular`).
 */
export function plural(
  count: number,
  singular: string,
  pluralForm?: string,
): string {
  const form = _rules.select(count);
  const word = form === "one" ? singular : (pluralForm ?? `${singular}s`);
  return `${count} ${word}`;
}

/**
 * Returns just the word form without the number.
 */
export function pluralWord(
  count: number,
  singular: string,
  pluralForm?: string,
): string {
  const form = _rules.select(count);
  return form === "one" ? singular : (pluralForm ?? `${singular}s`);
}
