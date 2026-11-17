import clsx from "clsx";
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("rounded-xl border bg-surface p-4", className)}>{children}</div>;
}
