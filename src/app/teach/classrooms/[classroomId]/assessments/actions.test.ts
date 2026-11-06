import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), assessment: vi.fn(), insertQuestion: vi.fn(),
  insertKey: vi.fn(), updateTotal: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({
  auth: { getUser: m.getUser }, rpc: m.rpc,
  from: (table: string) => {
    if (table === "assessments") return {
      select: () => ({ eq: () => ({ maybeSingle: m.assessment }) }),
      update: (row: unknown) => ({ eq: (key: string, value: string) => m.updateTotal(row, key, value) }),
    };
    if (table === "assessment_questions") return {
      select: (columns: string) => ({ eq: async () => columns === "points" ? { data: [{ points: 3 }] } : { count: 0 } }),
      insert: (row: unknown) => ({ select: () => ({ single: () => m.insertQuestion(row) }) }),
    };
    if (table === "assessment_answer_keys") return { insert: m.insertKey };
    throw new Error(`Unexpected table: ${table}`);
  },
}) }));

import { addQuestion } from "./actions";
const legacyId = "11111111-1111-1111-1111-111111111111";
const input = (id = legacyId) => ({
  classroomId: id, assessmentId: id, kind: "short" as const,
  prompt: "Say hello", points: 3, correctText: "hola",
});

beforeEach(() => {
  vi.resetAllMocks();
  m.getUser.mockResolvedValue({ data: { user: { id: "teacher" } } });
  m.rpc.mockResolvedValue({ data: true });
  m.assessment.mockResolvedValue({ data: { id: legacyId, classroom_id: legacyId } });
  m.insertQuestion.mockResolvedValue({ data: { id: "question" }, error: null });
  m.insertKey.mockResolvedValue({ error: null });
  m.updateTotal.mockResolvedValue({ error: null });
});

describe("Assessment Builder reconciliation", () => {
  it.each([legacyId, "a7117b3f-1b22-4d25-8f72-1c123dbe0a12"])("preserves question creation for database ID %s", async id => {
    m.assessment.mockResolvedValue({ data: { id, classroom_id: id } });
    await expect(addQuestion(input(id))).resolves.toEqual({ ok: true });
    expect(m.rpc).toHaveBeenCalledWith("is_classroom_teacher", { p_classroom: id });
    expect(m.insertQuestion).toHaveBeenCalledWith(expect.objectContaining({ assessment_id: id, prompt: "Say hello", points: 3, options: null }));
    expect(m.insertKey).toHaveBeenCalledWith(expect.objectContaining({ question_id: "question", correct_text: "hola" }));
    expect(m.updateTotal).toHaveBeenCalledWith({ total_points: 3 }, "id", id);
    expect(m.revalidate).toHaveBeenCalledWith(`/teach/classrooms/${id}/assessments/${id}`);
  });
  it("rejects malformed IDs before querying the database", async () => {
    await expect(addQuestion(input("not-an-id"))).rejects.toThrow();
    expect(m.getUser).not.toHaveBeenCalled();
  });
  it("retains the teacher membership check", async () => {
    m.rpc.mockResolvedValue({ data: false });
    await expect(addQuestion(input())).rejects.toThrow("You don't teach this classroom");
    expect(m.insertQuestion).not.toHaveBeenCalled();
  });
  it("rejects an assessment belonging to another classroom", async () => {
    m.assessment.mockResolvedValue({ data: { classroom_id: "another-classroom" } });
    await expect(addQuestion(input())).rejects.toThrow("Assessment not found");
    expect(m.insertQuestion).not.toHaveBeenCalled();
  });
  it("does not report success when storing the answer key fails", async () => {
    m.insertKey.mockResolvedValue({ error: { message: "write failed" } });
    await expect(addQuestion(input())).rejects.toThrow("Could not save answer key");
    expect(m.revalidate).not.toHaveBeenCalled();
  });
});
