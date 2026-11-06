import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomUUID } from "node:crypto";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SEEDED_ASSIGNMENT_ID } from "./env";

test("deletion removes personal rows and owned uploads without affecting another account", async ({ page, context }) => {
  // This destructive regression is deliberately limited to disposable local services.
  test.skip(!["localhost", "127.0.0.1"].includes(new URL(SUPABASE_URL).hostname), "Local database only");
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const created: { id: string; path: string }[] = [];
  const password = `Deletion-${randomUUID()}`;
  const cookies: { name: string; value: string }[] = [];
  const owner = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookies, setAll: (values) => {
      for (const value of values) {
        const index = cookies.findIndex(cookie => cookie.name === value.name);
        if (index >= 0) cookies[index] = value;
        else cookies.push(value);
      }
    } },
  });
  try {
    for (let index = 0; index < 2; index++) {
      const email = `deletion-${randomUUID()}@test.local`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      expect(error).toBeNull();
      const id = data.user!.id;
      const path = `${id}/${SEEDED_ASSIGNMENT_ID}/nested/proof.txt`;
      created.push({ id, path });
      const client = index === 0 ? owner : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
      expect((await client.storage.from("submissions").upload(path, Buffer.from("deletion regression"), { contentType: "text/plain" })).error).toBeNull();
      expect((await admin.from("user_stats").upsert({ user_id: id, xp: 42 })).error).toBeNull();
      expect((await admin.from("submissions").insert({ student_id: id, assignment_id: SEEDED_ASSIGNMENT_ID, file_url: path })).error).toBeNull();
    }
    const { data: { session } } = await owner.auth.getSession();
    await context.addCookies(cookies.map(cookie => ({ name: cookie.name, value: cookie.value, domain: "localhost", path: "/", sameSite: "Lax" as const })));
    await page.goto("/settings");
    await page.getByRole("button", { name: "Delete my account", exact: true }).click();
    await page.getByRole("button", { name: "Yes, delete everything", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    const deleted = created[0];
    for (const [table, key] of [["profiles", "id"], ["user_stats", "user_id"], ["submissions", "student_id"]]) {
      const result = await admin.from(table).select("*", { count: "exact", head: true }).eq(key, deleted.id);
      expect(result.error).toBeNull();
      expect(result.count).toBe(0);
    }
    expect((await admin.auth.admin.getUserById(deleted.id)).error).not.toBeNull();
    expect((await owner.auth.getUser(session!.access_token)).error).not.toBeNull();
    expect((await admin.storage.from("submissions").download(deleted.path)).error).not.toBeNull();
    expect((await admin.storage.from("submissions").download(created[1].path)).error).toBeNull();
    expect((await admin.auth.admin.getUserById(created[1].id)).data.user?.id).toBe(created[1].id);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/sign-in/);
  } finally {
    for (const user of created) {
      await admin.storage.from("submissions").remove([user.path]);
      await admin.auth.admin.deleteUser(user.id);
    }
  }
});
