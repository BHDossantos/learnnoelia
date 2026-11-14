import { describe, expect, it } from "vitest";
import { MarksSchema, markingTextLines, markLabel, normalizedPoint } from "./markings";
const base = { id: "11111111-1111-4111-8111-111111111111", surface: "image", x: 0.2, y: 0.3 };
describe("teacher markings", () => {
  it("keeps manually assigned scores independent of crosses and checks (including extra credit)", () => {
    const marks = MarksSchema.parse([{ ...base, kind: "cross" }, { ...base, id: "22222222-2222-4222-8222-222222222222", kind: "score", earned: 6, possible: 6 }]);
    expect(markLabel(marks[1])).toBe("6/6");
    expect(MarksSchema.safeParse([{ ...base, kind: "score", earned: 7, possible: 6 }]).success).toBe(true);
  });
  it("rejects invalid, unbounded, duplicate and non-finite marks", () => {
    for (const patch of [{ x: NaN }, { y: 1.1 }, { surface: "other" }, { kind: "script" }, { kind: "score", earned: 2, possible: 0 }]) {
      expect(MarksSchema.safeParse([{ ...base, kind: "check", ...patch }]).success).toBe(false);
    }
    expect(MarksSchema.safeParse(Array(501).fill({ ...base, kind: "check" })).success).toBe(false);
    expect(MarksSchema.safeParse(Array(2).fill({ ...base, kind: "check" })).success).toBe(false);
  });
  it("uses deterministic text lines without relying on browser font wrapping", () => {
    const text = "x".repeat(130) + "\n\n😀";
    expect(markingTextLines(text)).toEqual(["x".repeat(64), "x".repeat(64), "xx", "", "😀"]);
  });
  it("maps the same work location identically after zoom, scroll, and resize", () => {
    expect(normalizedPoint(250, 350, { left: 50, top: 50, width: 800, height: 1000 })).toEqual({ x: 0.25, y: 0.3 });
    expect(normalizedPoint(120, 130, { left: 20, top: -20, width: 400, height: 500 })).toEqual({ x: 0.25, y: 0.3 });
  });
});
