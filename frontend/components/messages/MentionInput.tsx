"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { getInitials, type MentionScope, type MentionableMember } from "@square/shared";
import { api } from "@/lib/api";
import clsx from "clsx";

const USERNAME_CHARS = String.raw`[\p{L}\p{M}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0F]+(?:-[\p{L}\p{M}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0F]+)*`;
const QUERY_CHARS = String.raw`[\p{L}\p{M}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0F-]*`;

function activeMention(value: string, cursor: number) {
  const before = value.slice(0, cursor);
  const match = new RegExp(`(^|[^\\p{L}\\p{N}._%+-])@(${QUERY_CHARS})$`, "u").exec(before);
  if (!match) return null;
  return { start: cursor - match[2].length - 1, query: match[2].replace(/^#/, "") };
}

function insertedMentionCount(value: string) {
  const safeText = value.replace(/`+[^`]*`+/g, " ");
  const regex = new RegExp(`(^|[^\\p{L}\\p{N}._%+-])@(${USERNAME_CHARS})`, "gu");
  return new Set([...safeText.matchAll(regex)].map(match => match[2].toLowerCase())).size;
}

export function MentionInput({
  value,
  onChange,
  scope,
  roomId,
  onSubmit,
  placeholder = "Write a message",
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  scope: MentionScope;
  roomId: string;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(0);
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<MentionableMember[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const count = useMemo(() => insertedMentionCount(value), [value]);
  const active = open ? activeMention(value, caret) : null;
  const query = active?.query || "";
  const limitReached = count >= 5;

  const loadPage = useCallback(async (nextCursor?: string | null, replace = false) => {
    setLoading(true);
    setLoadError(false);
    try {
      const page = await api.mentionableMembers(scope, roomId, { q: query, cursor: nextCursor || undefined, limit: 8 });
      setMembers(current => replace ? page.items : [...current, ...page.items.filter(member => !current.some(existing => existing.id === member.id))]);
      setCursor(page.nextCursor || null);
      setSelected(0);
      if (replace) {
        setScrollTop(0);
        listRef.current?.scrollTo(0, 0);
      }
    } catch (error) {
      console.error("Could not load mentionable members", error);
      setLoadError(true);
      setMembers([]);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, [query, roomId, scope]);
  const visibleStart = Math.max(0, Math.floor(scrollTop / 44) - 2);
  const visibleEnd = Math.min(members.length, Math.ceil((scrollTop + 280) / 44) + 2);

  useEffect(() => {
    const list = listRef.current;
    if (!active || !list) return;
    const top = selected * 44;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + 44 > list.scrollTop + list.clientHeight) list.scrollTop = top + 44 - list.clientHeight;
  }, [active, selected]);

  useEffect(() => {
    if (!active) {
      setMembers([]);
      setCursor(null);
      return;
    }
    void loadPage(null, true);
  }, [active, loadPage]);

  function insert(member: MentionableMember) {
    if (limitReached) return;
    const position = inputRef.current?.selectionStart ?? caret;
    const current = activeMention(value, position);
    if (!current) return;
    const insertion = `@${member.username.replace(/^#/, "")} `;
    const next = `${value.slice(0, current.start)}${insertion}${value.slice(position)}`;
    const nextCaret = current.start + insertion.length;
    onChange(next);
    setCaret(nextCaret);
    setOpen(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (active && limitReached && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault();
      return;
    }
    if (active && !limitReached && members.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected(index => Math.min(members.length - 1, index + 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected(index => Math.max(0, index - 1));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insert(members[selected]);
        return;
      }
    }
    if (event.key === "Escape" && active) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Backspace" && event.currentTarget.selectionStart === event.currentTarget.selectionEnd) {
      const position = event.currentTarget.selectionStart || 0;
      const before = value.slice(0, position);
      const match = new RegExp(`(^|[^\\p{L}\\p{N}])@(${USERNAME_CHARS}) $`, "u").exec(before);
      if (match) {
        event.preventDefault();
        const start = position - match[0].length + match[1].length;
        const next = `${value.slice(0, start)}${value.slice(position)}`;
        onChange(next);
        setCaret(start);
        requestAnimationFrame(() => inputRef.current?.setSelectionRange(start, start));
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      {active && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Mention members"
          onScroll={event => {
            const element = event.currentTarget;
            setScrollTop(element.scrollTop);
            if (cursor && !loading && element.scrollTop + element.clientHeight >= element.scrollHeight - 24) void loadPage(cursor);
          }}
          className="absolute bottom-full left-0 z-50 mb-2 max-h-[280px] w-full overflow-y-auto rounded-xl border border-border bg-bg-2 p-1 shadow-xl md:w-80"
        >
          <div className="relative" style={{ height: members.length * 44 }}>
            {members.slice(visibleStart, visibleEnd).map((member, offset) => {
              const index = visibleStart + offset;
              return (
                <button
                  key={member.id}
                  type="button"
                  role="option"
                  aria-selected={selected === index}
                  onMouseDown={event => event.preventDefault()}
                  onPointerDown={event => event.preventDefault()}
                  onClick={() => insert(member)}
                  className={clsx("absolute left-0 top-0 flex h-11 w-full items-center gap-2 rounded-lg px-2 text-left", selected === index ? "bg-surface-hi" : "hover:bg-surface")}
                  style={{ transform: `translateY(${index * 44}px)` }}
                >
                  <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-hi text-[10px] font-semibold text-lime">
                    {getInitials(member.username)}
                    {member.presence === "online" && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-2 bg-lime" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-lime">#{member.username.replace(/^#/, "")}</span>
                  <span className="max-w-[120px] shrink-0 truncate rounded-full bg-surface px-2 py-0.5 text-[10px] text-muted">
                    {member.role === "owner" ? "Owner" : member.role === "moderator" ? "Moderator" : member.schoolName || "Member"}
                  </span>
                </button>
              );
            })}
          </div>
          {limitReached && <div className="px-3 py-2 text-xs text-muted">You can tag up to 5 people</div>}
          {loading && Array.from({ length: 3 }, (_, index) => <div key={`skeleton-${index}`} className="m-1 h-11 animate-pulse rounded-lg bg-surface" />)}
          {loadError && <div className="px-3 py-3 text-center text-sm text-muted">Could not load members. Try again.</div>}
          {!loading && !loadError && members.length === 0 && <div className="px-3 py-4 text-center text-sm text-muted">No members found</div>}
        </div>
      )}
      <input
        ref={inputRef}
        value={value}
        onChange={event => {
          onChange(event.target.value);
          const position = event.target.selectionStart ?? event.target.value.length;
          setCaret(position);
          setOpen(!!activeMention(event.target.value, position));
        }}
        onClick={event => {
          const position = event.currentTarget.selectionStart ?? 0;
          setCaret(position);
          setOpen(!!activeMention(value, position));
        }}
        onKeyUp={event => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            const position = event.currentTarget.selectionStart ?? 0;
            setCaret(position);
            setOpen(!!activeMention(value, position));
          }
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        aria-label="Message"
        aria-autocomplete="list"
        aria-expanded={!!active}
      />
    </div>
  );
}
