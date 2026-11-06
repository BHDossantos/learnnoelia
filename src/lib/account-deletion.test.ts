import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { removeAccountUploads } from "./account-deletion";
const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
function fixture(list: ReturnType<typeof vi.fn>, remove = vi.fn().mockResolvedValue({ error: null })) {
  return { admin: { storage: { from: vi.fn(() => ({ list, remove })) } } as unknown as SupabaseClient, remove };
}
describe("account upload deletion", () => {
  it("recurses only under the authenticated user's prefix", async () => {
    const list = vi.fn().mockResolvedValueOnce({ data: [{ name: "assignment", id: null }] })
      .mockResolvedValueOnce({ data: [{ name: "voice.webm", id: "object" }] });
    const { admin, remove } = fixture(list);
    await removeAccountUploads(admin, id);
    expect(list.mock.calls.map(c => c[0])).toEqual([id, `${id}/assignment`]);
    expect(remove).toHaveBeenCalledWith([`${id}/assignment/voice.webm`]);
  });
  it("collects every page before removing objects", async () => {
    const list = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => ({ name: `${i}`, id: `${i}` })) })
      .mockResolvedValueOnce({ data: [{ name: "last", id: "last" }] });
    const { admin, remove } = fixture(list);
    await removeAccountUploads(admin, id);
    expect(list.mock.calls[1][1].offset).toBe(1000);
    expect(remove.mock.calls.map(c => c[0].length)).toEqual([1000, 1]);
    expect(list.mock.invocationCallOrder[1]).toBeLessThan(remove.mock.invocationCallOrder[0]);
  });
  it("stops on listing or removal errors", async () => {
    const { admin, remove } = fixture(vi.fn().mockResolvedValue({ data: null, error: {} }));
    await expect(removeAccountUploads(admin, id)).rejects.toThrow("check your uploads");
    expect(remove).not.toHaveBeenCalled();
    const failed = fixture(vi.fn().mockResolvedValue({ data: [{ name: "a", id: "a" }] }), vi.fn().mockResolvedValue({ error: {} }));
    await expect(removeAccountUploads(failed.admin, id)).rejects.toThrow("remove your uploads");
  });
  it("rejects traversal and invalid account IDs", async () => {
    const { admin } = fixture(vi.fn().mockResolvedValue({ data: [{ name: "..", id: null }] }));
    await expect(removeAccountUploads(admin, id)).rejects.toThrow("safely");
    await expect(removeAccountUploads(admin, "../someone")).rejects.toThrow("identifier");
  });
});
