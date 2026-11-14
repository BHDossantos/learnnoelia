import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } from "./env";

// Synthetic work only. Never point this destructive fixture at a hosted project.
if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(SUPABASE_URL)) throw new Error("Marking fixtures require the local devstack");
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
test.setTimeout(90_000);
const password = "synthetic-test-password-123";
const ids = { org: crypto.randomUUID(), classroom: crypto.randomUUID(), assignment: crypto.randomUUID(), paper: crypto.randomUUID(), submission: crypto.randomUUID() };
const people: Record<string, { id: string; email: string }> = {};
let originalPath: string;
let syntheticPng: Buffer;
let submissionPath: string;
function checked<T extends { error: unknown }>(result: T): T { if (result.error) throw new Error(JSON.stringify(result.error)); return result; }
async function signIn(context: BrowserContext, person: string) {
 await context.clearCookies();
 const client = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, { cookies: { getAll: () => [], setAll: async cookies => {
  await context.addCookies(cookies.map(c => ({ name: c.name, value: c.value, domain: "localhost", path: "/", sameSite: "Lax" as const })));
 } } });
 checked(await client.auth.signInWithPassword({ email: people[person].email, password }));
 return client;
}
async function canvas(page: Page, surface: "text" | "image") {
 const area = page.getByTestId(`marking-${surface}`);
 await expect(area.getByRole("button", { name: `Place ${surface} mark (Enter places at center)`, exact: true })).toBeVisible({ timeout: 20_000 });
 return area;
}
async function place(page: Page, surface: "text" | "image", x: number, y: number) {
 const area = await canvas(page, surface); const rect = (await area.boundingBox())!;
 await area.getByRole("button", { name: `Place ${surface} mark (Enter places at center)`, exact: true }).click({ position: { x: rect.width * x, y: rect.height * y } });
}
async function save(page: Page) {
 await page.getByRole("button", { name: "Save markings", exact: true }).click();
 await expect(page.getByText("Markings saved. Students can now see them.")).toBeVisible();
}

test.describe.serial("teacher markings on original work", () => {
 test.beforeAll(async ({ browser }) => {
  for (const name of ["teacher", "student", "outsider"]) {
   const email = `markings-${name}-${ids.paper}@test.local`;
   const { data } = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
   people[name] = { id: data.user!.id, email };
   checked(await admin.from("profiles").update({ display_name: `Synthetic ${name}`, role: name === "teacher" ? "teacher" : "student" }).eq("id", data.user!.id));
   if (name !== "teacher") checked(await admin.from("target_languages").insert({ user_id: data.user!.id, language: "es", cefr_level: "A1", active: true }));
  }
  checked(await admin.from("organizations").insert({ id: ids.org, name: "Synthetic marking test", invite_code: ids.org }));
  checked(await admin.from("classrooms").insert({ id: ids.classroom, org_id: ids.org, name: "Synthetic marking class" }));
  checked(await admin.from("classroom_members").insert([{ classroom_id: ids.classroom, user_id: people.teacher.id, role: "teacher" }, { classroom_id: ids.classroom, user_id: people.student.id, role: "student" }]));
  checked(await admin.from("assignments").insert({ id: ids.assignment, teacher_id: people.teacher.id, title: "Synthetic virtual exercise", instructions_md: "Show your reasoning", max_score: 10, published: true }));
  checked(await admin.from("submissions").insert({ id: ids.submission, assignment_id: ids.assignment, student_id: people.student.id, text: "Exercise 1\n2 + 2 = 4\n\nExercise 2\n3 × 3 = 8\n\nExplain your reasoning:\nI added three groups of three.", status: "returned" }));
  checked(await admin.from("ai_grades").insert({ submission_id: ids.submission, score: 6, max_score: 10 }));
  const context = await browser.newContext(); const client = await signIn(context, "teacher");
  const page = await context.newPage(); await page.setViewportSize({ width: 800, height: 1000 });
  await page.setContent('<main style="font:24px Georgia;padding:60px;color:#111"><h1>Synthetic practice paper</h1><p>Exercise 1 · Addition</p><p style="margin:60px">2 + 2 = 4</p><hr><p>Exercise 2 · Multiplication</p><p style="margin:60px">3 × 3 = 8</p><hr><p>Exercise 3 · Explain your answer</p><p style="margin:60px">I counted three groups.</p></main>');
  const png = await page.screenshot(); syntheticPng = png; originalPath = `${people.teacher.id}/${ids.paper}.png`;
  checked(await client.storage.from("paper-originals").upload(originalPath, png, { contentType: "image/png", upsert: false }));
  checked(await client.from("paper_gradings").insert({ id: ids.paper, student_id: people.student.id, graded_by: people.teacher.id, title: "Synthetic scanned exercise", source: "image", original_path: originalPath, original_mime: "image/png", score: 6, max_score: 10 }));
  await context.close();
 });
 test.afterAll(async () => {
  await admin.from("paper_gradings").delete().eq("id", ids.paper);
  if (originalPath) await admin.storage.from("paper-originals").remove([originalPath]);
  if (submissionPath) await admin.storage.from("submissions").remove([submissionPath]);
  await admin.from("assignments").delete().eq("id", ids.assignment);
  await admin.from("organizations").delete().eq("id", ids.org);
  for (const person of Object.values(people)) await admin.auth.admin.deleteUser(person.id);
 });
 test("scans: place independent scores, undo/redo, reload, resize and zoom", async ({ page, context }, info) => {
  await signIn(context, "teacher"); await page.goto(`/papers/${ids.paper}`);
  await place(page, "image", 0.76, 0.24);
  await page.getByRole("button", { name: "✕ Incorrect", exact: true }).click(); await place(page, "image", 0.75, 0.43);
  await page.getByRole("button", { name: "Earned / possible", exact: true }).click();
  await page.getByLabel("Earned points").fill("6"); await page.getByLabel("Possible points").fill("6"); await place(page, "image", 0.12, 0.43);
  await page.getByRole("button", { name: "Undo", exact: true }).click(); expect(await page.locator("[data-mark-id]").count()).toBe(2);
  await page.getByRole("button", { name: "Redo", exact: true }).click(); await save(page);
  await page.reload(); await expect(page.locator("[data-mark-id]")).toHaveCount(3);
  const positions = await page.locator("[data-mark-id]").evaluateAll(elements => elements.map(e => ({ left: (e as HTMLElement).style.left, top: (e as HTMLElement).style.top })));
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByLabel("Marking zoom").selectOption("0.5");
  expect(await page.locator("[data-mark-id]").evaluateAll(elements => elements.map(e => ({ left: (e as HTMLElement).style.left, top: (e as HTMLElement).style.top })))).toEqual(positions);
  await page.getByLabel("Marking zoom").selectOption("1.25"); await page.getByTestId("marking-image").evaluate(e => { e.parentElement!.parentElement!.scrollLeft = 140; });
  const mark = page.locator("[data-mark-id]").first();
  const measured = await mark.evaluate(e => { const a=e.getBoundingClientRect(); const b=e.closest('[data-testid]')!.getBoundingClientRect(); return { x:(a.x+a.width/2-b.x)/b.width, y:(a.y+a.height/2-b.y)/b.height }; });
  expect(measured.x).toBeCloseTo(0.76, 2); expect(measured.y).toBeCloseTo(0.24, 2);
  await page.setViewportSize({ width: 1200, height: 1000 }); await page.getByLabel("Marking zoom").selectOption("0.75");
  await page.getByRole("region", { name: "Teacher markings" }).screenshot({ path: info.outputPath("scanned-markings.png") });
  const stored = checked(await admin.from("paper_gradings").select("score,max_score,original_path").eq("id", ids.paper).single()).data!;
  expect(stored).toEqual({ score: 6, max_score: 10, original_path: originalPath });
 });
 test("virtual work: save failures retain drafts, corrections persist, concurrent saves conflict", async ({ page, context }, info) => {
  await signIn(context, "teacher"); await page.goto(`/teach/submissions/${ids.submission}`);
  await place(page, "text", 0.75, 0.25);
  await page.getByRole("button", { name: "✕ Incorrect", exact: true }).click(); await place(page, "text", 0.75, 0.5);
  await page.getByRole("button", { name: "Earned / possible", exact: true }).click(); await place(page, "text", 0.07, 0.5);
  await page.route("**/api/markings", route => route.request().method() === "PUT" ? route.fulfill({ status: 500, json: { error: "Simulated save failure; edits retained" } }) : route.continue());
  await page.getByRole("button", { name: "Save markings", exact: true }).click(); await expect(page.getByRole("region", { name: "Teacher markings" }).getByRole("alert")).toContainText("Simulated save failure"); await expect(page.locator("[data-mark-id]")).toHaveCount(3);
  await page.unroute("**/api/markings"); await save(page); await page.reload(); await expect(page.locator("[data-mark-id]")).toHaveCount(3);
  await page.locator("summary").filter({ hasText: "review and correct" }).click();
  await page.getByRole("button", { name: "Change to correct", exact: true }).click(); await save(page); await page.reload();
  await expect(page.locator("[data-mark-id]").filter({ has: page.locator("svg") })).toHaveCount(2);
  await page.getByRole("region", { name: "Teacher markings" }).screenshot({ path: info.outputPath("virtual-markings.png") });
  const current = await (await page.request.get(`/api/markings?kind=submission&id=${ids.submission}`)).json(); const doc = current.documents[0];
  const response = await page.request.put("/api/markings", { data: { kind: "submission", id: ids.submission, sourceKey: doc.source_key, version: doc.version, marks: doc.marks } }); expect(response.status()).toBe(200);
  await place(page, "text", 0.6, 0.8); await page.getByRole("button", { name: "Save markings", exact: true }).click();
  await expect(page.getByRole("region", { name: "Teacher markings" }).getByRole("alert")).toContainText("changed", { timeout: 15_000 }); await expect(page.locator("[data-mark-id]")).toHaveCount(4);
  page.on("dialog", d => d.accept()); await page.reload(); await expect(page.locator("[data-mark-id]")).toHaveCount(3);
 });
 test("student read-only feedback, unauthorized writes, and resubmission history", async ({ page, context }) => {
  await signIn(context, "student"); await page.goto(`/papers/${ids.paper}`); await expect(page.locator("[data-mark-id]")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Save markings", exact: true })).toHaveCount(0);
  await page.goto(`/assignments/${ids.assignment}/result`); await expect(page.locator("[data-mark-id]")).toHaveCount(3);
  const current = await (await page.request.get(`/api/markings?kind=submission&id=${ids.submission}`)).json(); const doc = current.documents[0];
  expect((await page.request.put("/api/markings", { data: { kind: "submission", id: ids.submission, sourceKey: doc.source_key, version: doc.version, marks: [] } })).status()).toBe(403);
  await signIn(context, "outsider"); expect((await page.request.get(`/api/markings?kind=paper&id=${ids.paper}`)).status()).toBe(404);
  checked(await admin.from("submissions").update({ text: "A revised virtual answer", submitted_at: new Date().toISOString() }).eq("id", ids.submission));
  await signIn(context, "teacher"); await page.goto(`/teach/submissions/${ids.submission}`);
  await expect(page.getByTestId("marking-text")).toContainText("A revised virtual answer"); await expect(page.locator("[data-mark-id]")).toHaveCount(0);
  await page.getByLabel("Work version", { exact: true }).selectOption(doc.source_key); await expect(page.locator("[data-mark-id]")).toHaveCount(3);
  await expect(page.getByTestId("marking-text")).toContainText("2 + 2 = 4"); await expect(page.getByRole("button", { name: "Save markings", exact: true })).toHaveCount(0);
 });
 test("image attachments in virtual submissions keep their own saved marking surface", async ({ page, context }) => {
  submissionPath = `${people.student.id}/${ids.assignment}/synthetic.png`;
  checked(await admin.storage.from("submissions").upload(submissionPath, syntheticPng, { contentType: "image/png", upsert: false }));
  checked(await admin.from("submissions").update({ file_url: submissionPath, submitted_at: new Date().toISOString() }).eq("id", ids.submission));
  await signIn(context, "teacher"); await page.goto(`/teach/submissions/${ids.submission}`);
  await place(page, "image", 0.72, 0.24); await page.getByRole("button", { name: "✕ Incorrect", exact: true }).click(); await place(page, "text", 0.7, 0.5);
  await save(page); await page.reload(); await expect(page.getByTestId("marking-image").locator("[data-mark-id]")).toHaveCount(1);
  await expect(page.getByTestId("marking-text").locator("[data-mark-id]")).toHaveCount(1);
  await signIn(context, "student"); await page.goto(`/assignments/${ids.assignment}/result`); await expect(page.locator("[data-mark-id]")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Save markings", exact: true })).toHaveCount(0);
 });
});
