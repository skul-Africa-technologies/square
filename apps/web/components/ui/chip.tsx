import clsx from "clsx";

export function Chip({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={clsx("inline-flex items-center rounded-full border px-3 py-1 text-xs", active ? "bg-lime-tint border-lime text-lime" : "bg-blue-soft border-blue-border text-blue hover:text-blue-strong")}>
        {children}
      </button>
    );
  }
  return <span className={clsx("inline-flex items-center rounded-full border px-3 py-1 text-xs", active ? "bg-lime-tint border-lime text-lime" : "bg-blue-soft border-blue-border text-blue")}>{children}</span>;
}
