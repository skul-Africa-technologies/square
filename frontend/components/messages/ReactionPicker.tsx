"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import clsx from "clsx";
import { REACTION_CATEGORIES, QUICK_REACTIONS } from "@square/shared";

type EmojiRecord = { emoji: string; name: string; skin_tone_support?: boolean };
type EmojiGroup = { name: string; emojis: EmojiRecord[] };
type EmojiData = { default: EmojiGroup[] };

const GROUPS: Record<(typeof REACTION_CATEGORIES)[number], string[]> = {
  Smileys: ["Smileys & Emotion"],
  People: ["People & Body"],
  Nature: ["Animals & Nature"],
  Food: ["Food & Drink"],
  Activity: ["Activities"],
  Travel: ["Travel & Places"],
  Objects: ["Objects"],
  Symbols: ["Symbols", "Flags"],
};
const TONES = ["", "🏻", "🏼", "🏽", "🏾", "🏿"];
const RECENTS_KEY = "square:recent-reactions";
const TONE_KEY = "square:reaction-skin-tone";

function readStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) as T : fallback;
  } catch {
    return fallback;
  }
}

function withSkinTone(emoji: string, tone: string): string {
  if (!tone) return emoji;
  return emoji.replace(/^(\p{Emoji_Modifier_Base}\uFE0F?)/u, `$1${tone}`);
}

export function ReactionPicker({
  anchorRef,
  existing,
  mine,
  disableNewDistinct,
  disableNewForUser,
  onSelect,
  onLimitReached,
  onClose,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  existing: string[];
  mine: string[];
  disableNewDistinct: boolean;
  disableNewForUser: boolean;
  onSelect: (emoji: string, keepOpen: boolean) => void;
  onLimitReached: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<EmojiGroup[]>();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof REACTION_CATEGORIES)[number]>("Smileys");
  const [recent, setRecent] = useState<string[]>([]);
  const [tone, setTone] = useState("");
  const [mobile, setMobile] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    setRecent(readStorage(RECENTS_KEY, []));
    setTone(readStorage(TONE_KEY, ""));
    let active = true;
    import("unicode-emoji-json/data-by-group.json").then((loaded) => {
      if (active) setData((loaded as unknown as EmojiData).default);
    }).catch((error: unknown) => {
      console.error("Could not load emoji data", error);
    });
    const updatePosition = () => {
      const isMobile = window.matchMedia("(max-width: 767px)").matches;
      setMobile(isMobile);
      if (isMobile || !anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const width = 320;
      const height = 380;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const top = rect.bottom + height + 8 <= window.innerHeight
        ? rect.bottom + 8
        : Math.max(8, rect.top - height - 8);
      setPosition({ left, top });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => {
      active = false;
      window.removeEventListener("resize", updatePosition);
    };
  }, [anchorRef]);

  useEffect(() => {
    searchRef.current?.focus();
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        anchorRef.current?.focus();
        return;
      }
      if (event.key === "Tab") {
        const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input")];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "ArrowDown" || event.key === "ArrowUp") {
        const options = [...dialog.querySelectorAll<HTMLButtonElement>("[data-emoji-option]")];
        const current = options.indexOf(document.activeElement as HTMLButtonElement);
        if (current < 0 || !options.length) return;
        event.preventDefault();
        const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? (mobile ? 7 : 8) : (mobile ? -7 : -8);
        options[(current + delta + options.length) % options.length]?.focus();
      }
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => dialog.removeEventListener("keydown", handleKeyDown);
  }, [anchorRef, mobile, onClose]);

  const items = useMemo(() => {
    const names = new Set(GROUPS[category]);
    const q = search.trim().toLowerCase();
    return (data || [])
      .filter(group => names.has(group.name))
      .flatMap(group => group.emojis)
      .filter(item => !q || item.name.toLowerCase().includes(q) || item.emoji.includes(q))
      .map(item => ({ ...item, emoji: item.skin_tone_support ? withSkinTone(item.emoji, tone) : item.emoji }));
  }, [category, data, search, tone]);

  const choose = (emoji: string, keepOpen = false) => {
    if ((disableNewDistinct && !existing.includes(emoji)) || (disableNewForUser && !mine.includes(emoji))) {
      onLimitReached();
      return;
    }
    setRecent(current => {
      const next = [emoji, ...current.filter(item => item !== emoji)].slice(0, 16);
      try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    onSelect(emoji, keepOpen);
  };

  const renderEmoji = (emoji: string, label: string, key: string, supportTone = false) => {
    const disabled = (disableNewDistinct && !existing.includes(emoji)) || (disableNewForUser && !mine.includes(emoji));
    return (
      <button
        key={key}
        type="button"
        data-emoji-option
        aria-label={`${emoji} ${label}`}
        aria-disabled={disabled}
        title={label}
        onClick={event => choose(emoji, event.shiftKey && !mobile)}
        className={clsx("flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-surface-hi focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-strong", disabled && "opacity-40")}
      >
        {supportTone ? withSkinTone(emoji, tone) : emoji}
      </button>
    );
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a reaction"
      data-testid="reaction-picker"
      className={clsx(
        "fixed z-[100] flex flex-col overflow-hidden border border-border bg-bg-2 shadow-2xl",
        mobile ? "inset-x-0 bottom-0 h-[55vh] rounded-t-[var(--sheet-radius)]" : "h-[380px] w-[320px] rounded-xl",
      )}
      style={mobile ? { paddingBottom: "env(safe-area-inset-bottom)" } : position}
    >
      {mobile && <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted/50" aria-hidden />}
      <div className="shrink-0 border-b border-border/60 px-3 pb-2 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted">Quick reactions</span>
          <div className="flex items-center gap-1">
            {TONES.map(value => (
              <button
                key={value || "default"}
                type="button"
                aria-label={value ? `Skin tone ${value}` : "Default skin tone"}
                aria-pressed={tone === value}
                onClick={() => {
                  setTone(value);
                  try { localStorage.setItem(TONE_KEY, JSON.stringify(value)); } catch {}
                }}
                className={clsx("h-6 w-6 rounded-full text-sm hover:bg-surface-hi", tone === value && "bg-blue-soft")}
              >
                {value || "○"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-between gap-1">
          {QUICK_REACTIONS.map(emoji => renderEmoji(emoji, "Quick reaction", `quick-${emoji}`))}
        </div>
        <input
          ref={searchRef}
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search emoji"
          aria-label="Search emoji"
          className="mt-2 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text outline-none focus:border-blue-strong"
        />
        {recent.length > 0 && (
          <div className="mt-2 flex items-center gap-1 overflow-x-auto">
            <span className="mr-1 shrink-0 text-[10px] text-muted">Recent</span>
            {recent.map(emoji => renderEmoji(emoji, "Recently used", `recent-${emoji}`))}
          </div>
        )}
      </div>
      <div role="tablist" aria-label="Emoji categories" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 px-2 py-1">
        {REACTION_CATEGORIES.map(value => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={category === value}
            onClick={() => setCategory(value)}
            className={clsx("shrink-0 rounded px-2 py-1 text-[10px] text-muted hover:bg-surface", category === value && "bg-blue-soft text-blue")}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!data ? (
          <div role="status" aria-label="Loading emoji" className="grid grid-cols-8 gap-1">
            {Array.from({ length: 32 }, (_, index) => <span key={index} className="h-9 w-9 animate-pulse rounded-lg bg-surface" />)}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1 md:grid-cols-8">
            {items.map(item => renderEmoji(item.emoji, item.name, item.emoji, item.skin_tone_support))}
          </div>
        )}
      </div>
    </div>
  );
}
