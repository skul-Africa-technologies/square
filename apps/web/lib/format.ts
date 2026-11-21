export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${trim(n / 1000)}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${trim(n / 1_000_000)}M`;
}

function trim(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace(/\.0$/, "");
}

export function channelLabel(slugOrName: string): string {
  return `# ${slugOrName}`;
}
