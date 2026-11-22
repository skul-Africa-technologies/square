import emojiRegex from "emoji-regex";
import { RGI_BASE_EMOJI } from "./emojiAllowlist";
import type { ReactionScope, ReactionSummary } from "./types";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "🎉", "👀", "🙏", "✅"] as const;
export const REACTION_CATEGORIES = ["Smileys", "People", "Nature", "Food", "Activity", "Travel", "Objects", "Symbols"] as const;
export const MAX_DISTINCT_REACTIONS_PER_MESSAGE = 20;
export const MAX_REACTIONS_PER_USER_PER_MESSAGE = 10;

export function isAllowedReactionEmoji(value: string): boolean {
  if (!value || new TextEncoder().encode(value).byteLength > 32) return false;
  if (RGI_BASE_EMOJI.has(value)) return true;
  if (!/\p{Emoji_Modifier}/u.test(value)) return false;
  const expression = emojiRegex();
  const match = expression.exec(value);
  return match?.index === 0 && match[0] === value && expression.exec(value) === null;
}

export function addReactionSummary(
  reactions: ReactionSummary[],
  emoji: string,
  userId: string,
  currentUserId: string,
): ReactionSummary[] {
  const current = reactions.find((reaction) => reaction.emoji === emoji);
  if (current) {
    if (current.me) return reactions;
    return reactions.map((reaction) =>
      reaction.emoji === emoji ? { ...reaction, count: reaction.count + 1, me: userId === currentUserId } : reaction,
    );
  }
  if (reactions.length >= MAX_DISTINCT_REACTIONS_PER_MESSAGE) {
    throw new Error("Reaction limit reached");
  }
  return [...reactions, { emoji, count: 1, me: userId === currentUserId }];
}

export function removeReactionSummary(reactions: ReactionSummary[], emoji: string): ReactionSummary[] {
  return reactions.flatMap((reaction) => {
    if (reaction.emoji !== emoji || !reaction.me) return [reaction];
    return reaction.count <= 1
      ? []
      : [{ ...reaction, count: reaction.count - 1, me: false }];
  });
}

export function applyReactionCount(reactions: ReactionSummary[], emoji: string, count: number): ReactionSummary[] {
  const index = reactions.findIndex((reaction) => reaction.emoji === emoji);
  if (count <= 0) return reactions.filter((reaction) => reaction.emoji !== emoji);
  if (index < 0) return [...reactions, { emoji, count, me: false }];
  return reactions.map((reaction) => reaction.emoji === emoji ? { ...reaction, count } : reaction);
}

export interface ReactionRequest {
  scope: ReactionScope;
  roomId: string;
  messageId: string;
  emoji: string;
  add: boolean;
  clientId: string;
}
