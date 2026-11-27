"use client";

import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { ButtonHTMLAttributes, ReactNode, useEffect, useRef, useState } from "react";
import { Badge } from "./badge";

export const HEX_POINTS = "26,3 49,16 49,42 26,55 3,42 3,16";

export function unreadRatio(unread: number) {
  if (unread <= 0) return 0;
  return Math.max(0.12, Math.min(1, unread / 20));
}

export function HexBadge({
  label,
  initials,
  imageSrc,
  active = false,
  unread = 0,
  className,
  size = 52,
}: {
  label: string;
  initials?: string;
  imageSrc?: string;
  active?: boolean;
  unread?: number;
  className?: string;
  size?: number;
}) {
  const ratio = unreadRatio(unread);
  const dash = Math.round(159 * ratio);
  return (
    <span className={clsx("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size * 58 / 52 }}>
      <svg viewBox="0 0 52 58" aria-hidden="true" className="absolute inset-0 h-full w-full">
        {ratio > 0 ? (
          <polygon points={HEX_POINTS} fill="none" stroke="var(--blue)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={`${dash} 159`} />
        ) : (
          <polygon points={HEX_POINTS} fill="none" stroke="var(--line)" strokeWidth="1.5" strokeLinejoin="round" />
        )}
        <polygon
          points={HEX_POINTS}
          fill={active ? "var(--green)" : "#151d19"}
          stroke={active ? "var(--green)" : "#2c3832"}
          strokeWidth="1.5"
          strokeLinejoin="round"
          transform="translate(26 29) scale(.76) translate(-26 -29)"
        />
      </svg>
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt=""
          aria-hidden="true"
          className="relative z-10 h-[76%] w-[76%] object-cover"
          style={{ clipPath: "polygon(50% 5.2%, 94.2% 27.6%, 94.2% 72.4%, 50% 94.8%, 5.8% 72.4%, 5.8% 27.6%)" }}
        />
      ) : (
        <span className={clsx("relative z-10 text-[12px] font-bold", active ? "text-[var(--bg)]" : "text-[var(--green)]")}>
          {initials || ""}
        </span>
      )}
      <span className="sr-only">{label}{unread ? `, ${unread} unread` : ""}</span>
    </span>
  );
}

export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return <Badge unread={count} mentions={0} className={className} />;
}

function hashId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function RobotAvatar({
  id,
  pictureUrl,
  size = 40,
  online,
  className,
}: {
  id: string;
  pictureUrl?: string | null;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  const hash = hashId(id);
  const style = hash % 6;
  const color = hash % 2 === 0 ? "var(--green)" : "var(--blue)";
  let eyes: ReactNode;
  if (style === 0) eyes = <path d="M15 19q2.5-4 5 0M21 19q2.5-4 5 0" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" />;
  else if (style === 1) eyes = <><rect x="16" y="15.5" width="2.6" height="6" rx="1.3" fill={color}/><rect x="22.4" y="15.5" width="2.6" height="6" rx="1.3" fill={color}/></>;
  else if (style === 2) eyes = <><circle cx="17" cy="18.5" r="2" fill={color}/><circle cx="24" cy="18.5" r="2" fill={color}/></>;
  else if (style === 3) eyes = <path d="M15 15.5l4 3-4 3M26 15.5l-4 3 4 3" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  else if (style === 4) eyes = <path d="M14 18.5h13" stroke={color} strokeWidth="2.4" strokeLinecap="round" />;
  else eyes = <><path d="M15 19q2.5-4 5 0" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round"/><circle cx="24.5" cy="18" r="2.2" fill={color}/></>;

  return (
    <span className={clsx("relative inline-block shrink-0 overflow-visible", className)} style={{ width: size, height: size }}>
      {pictureUrl ? (
        <Image src={pictureUrl} alt="" fill sizes={`${size}px`} className="rounded-[12px] object-cover" />
      ) : (
        <svg viewBox="0 0 41 41" aria-hidden="true" className="h-full w-full">
          <rect width="41" height="41" rx="12" fill="var(--raised)" />
          {style === 2 && <path d="M9 14L8 4l8 5zM32 14l1-10-8 5z" fill="#e8ecef" />}
          {style === 3 && <><path d="M20.5 8V3" stroke="#e8ecef" strokeWidth="1.5"/><circle cx="20.5" cy="2.5" r="1.8" fill={color}/></>}
          <path d="M6 41c0-9 6-12 14.5-12S35 32 35 41z" fill="#e8ecef" />
          <rect x="9" y="7" width="23" height="21" rx="9.5" fill="#e8ecef" />
          <rect x="12" y="12" width="17" height="12" rx="6" fill="var(--bg)" />
          {eyes}
        </svg>
      )}
      {online !== undefined && (
        <span
          aria-label={online ? "Online" : "Offline"}
          className="absolute bottom-[-1px] right-[-1px] h-[11px] w-[11px] rounded-full border-2"
          style={{ background: online ? "var(--blue)" : "var(--offline)", borderColor: "var(--panel)" }}
        />
      )}
    </span>
  );
}

export function AngleButton({
  as = "button",
  href,
  children,
  secondary = false,
  className,
  small = false,
  ...props
}: {
  as?: "button" | "link";
  href?: string;
  children: ReactNode;
  secondary?: boolean;
  small?: boolean;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  const cut = small ? 6 : 10;
  const classes = clsx(
    "inline-flex min-h-10 items-center justify-center font-bold outline-none transition-opacity disabled:cursor-not-allowed disabled:opacity-50",
    small ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
    secondary ? "bg-[var(--blue-deep)] text-[var(--blue)]" : "bg-[var(--green)] text-[var(--bg)]",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]",
    className,
  );
  const style = { clipPath: `polygon(${cut}px 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0 calc(100% - ${cut}px), 0 ${cut}px)` };
  if (as === "link" && href) return <Link href={href} prefetch={false} className={classes} style={style}>{children}</Link>;
  return <button className={classes} style={style} {...props}>{children}</button>;
}

export function CurvedPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("overflow-hidden rounded-tl-[26px] border-l-[1.5px] border-t-[1.5px]", className)} style={{ borderColor: "var(--blue)", background: "var(--panel)" }}>
      {children}
    </div>
  );
}

export function FilterMenu({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, []);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="flex min-h-10 items-center gap-2 rounded-[12px] border px-3 text-xs text-[var(--text)]"
      >
        <RobotAvatar id="filter" size={20} />
        <span>{value}</span>
        <span aria-hidden="true" className="text-[10px] text-[var(--muted)]">⌄</span>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-40 w-48 rounded-[12px] border bg-[var(--panel)] p-1">
          {options.map(option => (
            <button
              key={option}
              type="button"
              role="menuitem"
              onClick={() => { onChange(option); setOpen(false); }}
              className={clsx("flex min-h-10 w-full items-center rounded-[8px] px-3 text-left text-sm", option === value ? "text-[var(--blue)]" : "text-[var(--text)] hover:bg-[var(--raised)]")}
            >
              <span className="flex-1">{option}</span>
              {option === value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

