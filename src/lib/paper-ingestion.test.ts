import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ preserve: vi.fn(), insert: vi.fn(), model: vi.fn() }));
const teacher = "11111111-1111-4111-8111-111111111111", student = "22222222-2222-4222-8222-222222222222";
vi.mock("@/lib/paper-original", () => ({ preservePaperOriginal: m.preserve }));
vi.mock("@/lib/anthropic", () => ({ MODEL: "synthetic", anthropic: { messages: { create: m.model } } }));
vi.mock("@/lib/rate-limit", () => ({ takeRateLimit: async () => true }));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({
 auth: { getUser: async () => ({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } } }) },
 rpc: async () => ({ data: true }),
 from: (table: string) => table === "paper_gradings" ? { insert: m.insert } : { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { classroom_id: "class" } }) }) }) }) }) },
}) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { display_name: "Synthetic student" } }) }) }) }) }) }));
import { POST as single } from "@/app/api/grade/paper/route";
import { POST as bulk } from "@/app/api/teach/grade-file/route";
beforeEach(() => {
 vi.clearAllMocks(); vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-test-only");
 m.model.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ score: 6, max_score: 10, transcribed: "Model transcription" }) }] });
 m.preserve.mockResolvedValue(`${teacher}/original.png`);
 m.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "saved" }, error: null }) }) });
});
afterAll(() => vi.unstubAllEnvs());
const request = (body: unknown) => new Request("http://local/api/grade/paper", { method: "POST", body: JSON.stringify(body) });
describe("original work filing through both grading routes", () => {
 it("single scan keeps original bytes and exact supplied text independently of model transcription", async () => {
  const bytes = Buffer.from("synthetic scan");
  const response = await single(request({ studentId: student, text: "Original supplied work", image: { media_type: "image/png", data: bytes.toString("base64") } }));
  expect(response.status).toBe(200);
  expect(m.preserve).toHaveBeenCalledWith(expect.anything(), teacher, bytes, "image/png");
  expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ raw_text: "Original supplied work", original_path: `${teacher}/original.png`, original_mime: "image/png" }));
 });
 it("typed single work does not require storage or substitute the model transcription", async () => {
  expect((await single(request({ studentId: student, text: "My original answer" }))).status).toBe(200);
  expect(m.preserve).not.toHaveBeenCalled(); expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ raw_text: "My original answer", original_path: null }));
 });
 it("bulk scans retain their original and storage failure prevents filing", async () => {
  function upload() { const form = new FormData(); form.set("classroomId", teacher); form.set("studentId", student); form.set("file", new File(["synthetic bulk scan"], "work.png", { type: "image/png" })); return new Request("http://local/api/teach/grade-file", { method: "POST", body: form }); }
  expect((await bulk(upload())).status).toBe(200);
  expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ source: "image", original_path: `${teacher}/original.png`, original_mime: "image/png" }));
  m.insert.mockClear(); m.preserve.mockRejectedValueOnce(new Error("Storage unavailable"));
  expect((await bulk(upload())).status).toBe(502); expect(m.insert).not.toHaveBeenCalled();
 });
 it("single scan storage failure prevents grade creation rather than silently dropping the image", async () => {
  m.preserve.mockRejectedValueOnce(new Error("Storage unavailable"));
  expect((await single(request({ studentId: student, image: { media_type: "image/png", data: "cGFwZXI=" } }))).status).toBe(502);
  expect(m.insert).not.toHaveBeenCalled();
 });
});
