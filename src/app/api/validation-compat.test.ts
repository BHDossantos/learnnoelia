import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ create: vi.fn(), getUser: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({ anthropic: { messages: { create: m.create } }, MODEL: "test" }));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({ auth: { getUser: m.getUser }, from: () => ({ select: () => ({ eq: () => ({ single: m.single }) }) }) }) }));
import { POST as generate } from "./generate/route";
import { POST as translate } from "./translate/route";
import { POST as coach } from "./coach/route";
const request = (body: unknown) => new Request("http://localhost/api/test", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("ANTHROPIC_API_KEY", "test-not-a-credential");
  m.getUser.mockResolvedValue({ data: { user: { id: "teacher" } } });
  m.single.mockResolvedValue({ data: { teacher_id: "teacher", title: "Class", language: "en", kind: "language" } });
  m.create.mockResolvedValue({ content: [{ type: "text", text: '{"title":"Draft","translation":"Hola"}' }] });
});
afterEach(() => vi.unstubAllEnvs());
describe("Zod 4 request compatibility", () => {
  it.each(["11111111-1111-1111-1111-111111111111", "a7117b3f-1b22-4d25-8f72-1c123dbe0a12"])("accepts existing PostgreSQL course ID %s and default lesson kind", async courseId => {
    const result = await generate(request({ courseId, target: "lesson", topic: "Greetings" }));
    expect(result.status).toBe(200);
    expect(m.create.mock.calls[0][0].system).toContain("reading lesson");
  });
  it("rejects malformed IDs before touching database or model", async () => {
    const result = await generate(request({ courseId: "not-a-uuid", target: "lesson", topic: "Greetings" }));
    expect(result.status).toBe(400); expect(m.getUser).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });
  it("preserves translation defaults and field-error response shape", async () => {
    expect((await translate(request({ text: "Hello", target: "es" }))).status).toBe(200);
    expect(m.create.mock.calls[0][0].system).toContain("auto-detect");
    expect(m.create.mock.calls[0][0].system).toContain("neutral");
    const invalid = await translate(request({ text: "", target: "invalid" }));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.fieldErrors).toHaveProperty("text");
  });
  it("rejects oversized conversation arrays without invoking the model", async () => {
    const result = await coach(request({ messages: Array.from({ length: 1000 }, () => ({ role: "user", content: "Hi" })) }));
    expect(result.status).toBe(400); expect(m.create).not.toHaveBeenCalled();
  });
});
