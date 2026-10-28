import { test, expect } from "./fixtures";

// Teacher lesson editing: create course + lesson, edit the title, verify the
// change appears, then delete the lesson.
test("teacher can edit and delete a lesson", async ({ page }) => {
  const courseTitle = `Edit test ${Date.now()}`;

  await page.goto("/teach");
  await page.getByRole("link", { name: /\+ build a course/i }).first().click();
  await page.locator('input[name="title"]').fill(courseTitle);
  await page.locator('select[name="language"]').selectOption("es");
  await page.getByRole("button", { name: "Create course" }).click();
  await page.waitForURL(/\/teach\/courses\/.+/);

  await page.getByRole("link", { name: /\+ lesson/i }).first().click();
  await page.getByTestId("lesson-title").fill("Original title");
  await page.getByTestId("vocab-term-0").fill("uno");
  await page.getByTestId("vocab-translation-0").fill("one");
  await page.getByTestId("lesson-save").click();
  await page.waitForURL(/\/teach\/courses\/[^/]+$/);

  // Edit
  await page.getByRole("link", { name: "Edit" }).first().click();
  await expect(page.getByTestId("edit-title")).toHaveValue("Original title");
  await page.getByTestId("edit-title").fill("Renamed title");
  await page.getByTestId("edit-save").click();
  await page.waitForURL(/\/teach\/courses\/[^/]+$/);
  await expect(page.getByTestId("teacher-lessons").getByText("Renamed title")).toBeVisible();

  // Delete
  await page.getByRole("link", { name: "Edit" }).first().click();
  await page.getByTestId("edit-delete").click();
  await page.waitForURL(/\/teach\/courses\/[^/]+$/);
  await expect(page.getByText(/no lessons yet/i)).toBeVisible();
});
