import { describe, expect, it, vi } from "vitest";
import { preservePaperOriginal } from "./paper-original";
describe("private original upload", () => {
 it("preserves identical bytes in a private bucket using unique non-overwriting paths", async () => {
  const upload = vi.fn().mockResolvedValue({ error: null }); const from = vi.fn(() => ({ upload }));
  const db = { storage: { from } } as any; const bytes = Buffer.from("synthetic original bytes");
  const a = await preservePaperOriginal(db, "teacher", bytes, "image/png"); const b = await preservePaperOriginal(db, "teacher", bytes, "image/png");
  expect(a).not.toBe(b); expect(from).toHaveBeenCalledWith("paper-originals");
  expect(upload).toHaveBeenCalledWith(a, bytes, { contentType: "image/png", upsert: false });
 });
 it("stops filing when private storage fails", async () => {
  const db = { storage: { from: () => ({ upload: async () => ({ error: { message: "down" } }) }) } } as any;
  await expect(preservePaperOriginal(db, "teacher", Buffer.from("paper"), "image/png")).rejects.toThrow("No grade was filed");
 });
});
