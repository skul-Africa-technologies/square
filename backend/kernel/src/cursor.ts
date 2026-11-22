import { z } from "zod";

const cursorSchema = z
  .object({
    id: z.string().min(1).max(128),
    score: z.number().finite().optional(),
  })
  .strict();

export type Cursor = z.infer<typeof cursorSchema>;

export function encodeCursor(cursor: Cursor): string {
  const validated = cursorSchema.parse(cursor);
  return Buffer.from(JSON.stringify(validated), "utf8").toString("base64url");
}

export function decodeCursor(value: string | undefined): Cursor | undefined {
  if (value === undefined) return undefined;
  if (value.length < 1 || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid cursor");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid cursor");
  }

  const result = cursorSchema.safeParse(decoded);
  if (!result.success) throw new Error("Invalid cursor");
  return result.data;
}
