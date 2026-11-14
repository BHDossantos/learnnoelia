import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), sign: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from, storage: { from: () => ({ createSignedUrl: mocks.sign }) } }) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({ storage: { from: () => ({ createSignedUrl: mocks.sign }) } }) }));
import { GET, PUT } from "./route";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const body = { kind: "paper", id, sourceKey: "a".repeat(32), version: 0, marks: [{ id, kind: "score", surface: "image", x: 0.1, y: 0.2, earned: 6, possible: 6 }] };
const put = (value: unknown = body) => PUT(new Request("http://local/api/markings", { method: "PUT", body: JSON.stringify(value) }));
beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: "teacher" } } }); mocks.rpc.mockResolvedValue({ data: { version: 1, marks: body.marks }, error: null }); });
describe("markings HTTP boundary", () => {
 it("requires login, rejects malformed input and returns explicit save confirmation", async () => {
  expect((await put({ ...body, marks: [{ ...body.marks[0], possible: 0 }] })).status).toBe(400);
  mocks.getUser.mockResolvedValueOnce({ data: { user: null } }); expect((await put()).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
  const response = await put(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
  expect((await response.json()).document.marks).toEqual(body.marks);
  expect(mocks.rpc).toHaveBeenCalledWith("save_grading_markings", expect.objectContaining({ p_version: 0, p_marks: body.marks }));
 });
 it("reports authorization, concurrent edit and persistence failures without reporting saved", async () => {
  for (const [code, status] of [["42501", 403], ["40001", 409], ["PT409", 409], ["other", 500]] as const) {
   mocks.rpc.mockResolvedValueOnce({ data: null, error: { code } });
   const response = await put(); expect(response.status).toBe(status); expect(await response.json()).not.toHaveProperty("document");
  }
 });
 it("loads both current work and saved history using private signed links", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: { source_key: body.sourceKey, file: "teacher/scan.png", can_edit: true }, error: null });
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ order: async () => ({ data: [{ source_file: "teacher/scan.png", marks: body.marks }], error: null }) }) }) });
  mocks.sign.mockResolvedValue({ data: { signedUrl: "https://private.example/signed" }, error: null });
  const response = await GET(new Request(`http://local/api/markings?kind=paper&id=${id}`));
  expect(response.status).toBe(200); expect((await response.json()).documents[0].marks).toEqual(body.marks);
  expect(mocks.sign).toHaveBeenCalledWith("teacher/scan.png", 600);
 });
 it("never signs an original before the RLS source lookup grants access", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0002" } });
  expect((await GET(new Request(`http://local/api/markings?kind=paper&id=${id}`))).status).toBe(404);
  expect(mocks.sign).not.toHaveBeenCalled();
 });
});
