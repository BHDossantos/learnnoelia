import { test, expect } from "@playwright/test";

// Uses the bare (unauthenticated) test — no fixture — to confirm the auth gate.
test.describe("auth gate (signed out)", () => {
  test("protected page redirects to sign-in", async ({ page }) => {
    await page.goto("/learn");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("protected API returns 401 JSON, not an HTML redirect", async ({ request }) => {
    const resp = await request.post("/api/translate", { data: {} });
    expect(resp.status()).toBe(401);
    expect(resp.headers()["content-type"]).toContain("application/json");
  });

  test("sign-in page is publicly reachable", async ({ page }) => {
    const resp = await page.goto("/sign-in");
    expect(resp?.status()).toBe(200);
    await expect(page.getByRole("button", { name: /magic link/i })).toBeVisible();
  });

  test("legal pages and PWA assets are public", async ({ request }) => {
    for (const path of ["/legal/privacy", "/legal/terms", "/icon-192.png", "/og.png"]) {
      const resp = await request.get(path);
      expect(resp.status(), path).toBe(200);
    }
  });

  test("public account deletion instructions link to the protected flow and privacy help", async ({ page }) => {
    await page.goto("/legal/privacy");
    await page.getByRole("link", { name: "request account deletion on the web" }).click();
    await expect(page.getByRole("heading", { name: "Delete your LearnNoelia account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "privacy@learnnoelia.com" })).toHaveAttribute(
      "href", /^mailto:privacy@learnnoelia[.]com[?]/,
    );
    await page.getByRole("link", { name: "Open account settings" }).click();
    await expect(page).toHaveURL(/\/sign-in[?].*redirectTo=/);
  });

  test("unknown route serves the branded 404 for signed-out users via sign-in redirect", async ({ page }) => {
    // Middleware sends unknown paths to sign-in when logged out — by design
    // (private-by-default). This just pins the behavior.
    await page.goto("/definitely-not-a-page");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test("auth callback route is public and redirects home on bare hit", async ({ request }) => {
  const resp = await request.get("/auth/callback", { maxRedirects: 0 });
  expect([307, 308]).toContain(resp.status());
  expect(resp.headers()["location"]).not.toContain("/sign-in");
});

test("auth callback forwards provider errors to the sign-in page", async ({ request }) => {
  // Supabase reports OAuth failures as ?error/error_description with no
  // code. These must land on sign-in with the reason attached — dropping
  // them makes failures look like a silent bounce.
  const resp = await request.get(
    "/auth/callback?error=access_denied&error_description=Provider+said+no",
    { maxRedirects: 0 },
  );
  expect([307, 308]).toContain(resp.status());
  const location = resp.headers()["location"] ?? "";
  expect(location).toContain("/sign-in");
  expect(location).toContain("error=Provider%20said%20no");
});

test("auth callback never redirects off-site via redirectTo", async ({ request }) => {
  const resp = await request.get(
    "/auth/callback?redirectTo=https://evil.example.com",
    { maxRedirects: 0 },
  );
  const location = resp.headers()["location"] ?? "";
  expect(location).not.toContain("evil.example.com");
});
