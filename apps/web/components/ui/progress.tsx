export function Progress({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / Math.max(max,1)) * 100));
  return (
    <div className="h-2 w-full rounded-full bg-bg-2 overflow-hidden" aria-label={`${pct}%`}>
      <div className="h-full bg-lime" style={{ width: `${pct}%` }} />
    </div>
  );
}
