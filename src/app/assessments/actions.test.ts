import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ getUser: vi.fn(), upsert: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({
  auth: { getUser: m.getUser }, from: () => ({ upsert: m.upsert }),
}) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: vi.fn() }));
import { saveResponse } from "./actions";
const id = "11111111-1111-1111-1111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  m.getUser.mockResolvedValue({ data: { user: { id: "student" } } });
  m.upsert.mockResolvedValue({ error: null });
});
describe("assessment autosave identifier compatibility", () => {
  it("accepts existing PostgreSQL identifiers after the Zod 4 upgrade", async () => {
    await expect(saveResponse({ attemptId: id, questionId: id, response: "answer" })).resolves.toEqual({ ok: true });
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ attempt_id: id, question_id: id }), expect.anything());
  });
  it("rejects malformed identifiers before accessing the database", async () => {
    await expect(saveResponse({ attemptId: "invalid", questionId: id, response: "answer" })).rejects.toThrow();
    expect(m.getUser).not.toHaveBeenCalled();
  });
});
