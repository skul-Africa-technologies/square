export function cn(...xs: Array<string | false | null | undefined>) { return xs.filter(Boolean).join(" "); }
export function timeLeft(endsAt: string) {
  const days = Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000));
  return `${days} day${days === 1 ? "" : "s"}`;
}
