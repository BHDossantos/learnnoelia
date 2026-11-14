import { z } from "zod";

const position = { id: z.string().uuid(), surface: z.enum(["text", "image"]), x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) };
export const MarkSchema = z.discriminatedUnion("kind", [
  z.object({ ...position, kind: z.literal("check") }).strict(),
  z.object({ ...position, kind: z.literal("cross") }).strict(),
  z.object({ ...position, kind: z.literal("score"), earned: z.number().finite().min(0).max(10000), possible: z.number().finite().positive().max(10000) }).strict(),
]);
export const MarksSchema = z.array(MarkSchema).max(500).refine(m => new Set(m.map(x => x.id)).size === m.length, "Duplicate mark IDs");
export const MarkTarget = z.object({ kind: z.enum(["paper", "submission"]), id: z.string().uuid() });
export const SaveMarkings = MarkTarget.extend({ sourceKey: z.string().regex(/^[a-f0-9]{32}$/), version: z.number().int().min(0), marks: MarksSchema });
export type Mark = z.infer<typeof MarkSchema>;
export type MarkingSource = { source_key: string; text: string | null; file: string | null; mime: string | null; can_edit: boolean };
export type MarkingDocument = { id: string; source_key: string; source_text: string | null; source_file: string | null; source_mime: string | null; marks: Mark[]; version: number; updated_at: string };

export function markLabel(mark: Mark) {
  return mark.kind === "score" ? `${mark.earned}/${mark.possible}` : mark.kind === "check" ? "Correct" : "Incorrect";
}
export function normalizedPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) {
  return { x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) };
}

// Explicit wrapping keeps saved text positions stable across browser fonts and
// devices. The original string remains stored unchanged; this is display only.
export function markingTextLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n").flatMap(line => {
    const characters = Array.from(line);
    if (!characters.length) return [""];
    const lines: string[] = [];
    for (let i = 0; i < characters.length; i += 64) lines.push(characters.slice(i, i + 64).join(""));
    return lines;
  });
}
