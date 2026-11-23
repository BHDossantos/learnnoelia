import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ getUser: vi.fn(), read: vi.fn(), insert: vi.fn(), update: vi.fn(), revalidate: vi.fn(), redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({
  auth: { getUser: m.getUser },
  from: (table: string) => {
    if (table === "submissions") return {
      select: () => ({ eq: () => ({ single: m.read }) }),
      update: (row: unknown) => ({ eq: (key: string, id: string) => m.update(row, key, id) }),
    };
    if (table === "teacher_reviews") return { insert: m.insert };
    throw new Error(`Unexpected table ${table}`);
  },
}) }));
import { submitTeacherReview } from "./actions";
const id = "11111111-1111-1111-1111-111111111111";
function form(score: string | null = "80") {
  const data = new FormData();
  data.set("submissionId", id);
  if (score !== null) data.set("finalScore", score);
  data.set("comments", "Reviewed feedback");
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.getUser.mockResolvedValue({ data: { user: { id: "teacher" } } });
  m.read.mockResolvedValue({ data: { status: "graded", assignment: { teacher_id: "teacher", max_score: 100 } }, error: null });
  m.insert.mockResolvedValue({ error: null });
  m.update.mockResolvedValue({ error: null });
  m.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});
describe("explicit teacher review acceptance", () => {
  it.each([null, "", "   ", "NaN", "Infinity", "-1", "10001"])("rejects missing or invalid score %s before writes", async score => {
    await expect(submitTeacherReview(form(score))).rejects.toThrow();
    expect(m.read).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
  it.each(["0", "80.5", "100", " 75 "])("preserves explicit valid score %s", async score => {
    await expect(submitTeacherReview(form(score))).rejects.toThrow(`REDIRECT:/teach/submissions/${id}`);
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ final_score: Number(score), teacher_id: "teacher", approved_ai: false }));
    expect(m.update).toHaveBeenCalledWith({ status: "returned" }, "id", id);
    expect(m.revalidate).toHaveBeenCalled();
  });
  it.each([
    { status: "draft", assignment: { teacher_id: "teacher", max_score: 100 } },
    { status: "graded", assignment: { teacher_id: "other", max_score: 100 } },
    { status: "graded", assignment: { teacher_id: "teacher", max_score: 50 } },
  ])("does not publish drafts, another teacher's work, or scores above the assignment maximum", async submission => {
    m.read.mockResolvedValue({ data: submission, error: null });
    await expect(submitTeacherReview(form())).rejects.toThrow();
    expect(m.insert).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("redirects unauthenticated callers before reading work", async () => {
    m.getUser.mockResolvedValue({ data: { user: null } });
    await expect(submitTeacherReview(form())).rejects.toThrow("REDIRECT:/sign-in");
    expect(m.read).not.toHaveBeenCalled();
  });
  it("does not return work if saving the review fails", async () => {
    m.insert.mockResolvedValue({ error: { message: "write failed" } });
    await expect(submitTeacherReview(form())).rejects.toThrow("review could not be saved");
    expect(m.update).not.toHaveBeenCalled();
    expect(m.revalidate).not.toHaveBeenCalled();
  });
  it("reports partial failure rather than successful publication", async () => {
    m.update.mockResolvedValue({ error: { message: "update failed" } });
    await expect(submitTeacherReview(form())).rejects.toThrow("review was saved but could not be returned");
    expect(m.revalidate).not.toHaveBeenCalled();
    expect(m.redirect).not.toHaveBeenCalled();
  });
});
