import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import type { GradeCategory, GradeItem, SchemeBand } from "@/lib/gradebook";
import { GradebookGrid } from "./GradebookGrid";
import {
  addCategory,
  deleteCategory,
  addItem,
  deleteItem,
  toggleItemPublished,
  updateGradebookSettings,
  ensureGradebookSettings,
  importAssignment,
  syncAssignmentItem,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gradebook" };

export default async function GradebookPage(props: { params: Promise<{ classroomId: string }> }) {
  const { classroomId } = await props.params;
  const user = await requireOnboardedUser();
  const supabase = await supabaseServer();

  // Must teach this classroom.
  const { data: isTeacher } = await supabase.rpc("is_classroom_teacher", { p_classroom: classroomId });
  if (!isTeacher) notFound();

  const { data: classroom } = await supabase
    .from("classrooms")
    .select("id,name,org_id")
    .eq("id", classroomId)
    .maybeSingle();
  if (!classroom) notFound();

  await ensureGradebookSettings(classroomId);

  const [{ data: roster }, { data: cats }, { data: items }, { data: settings }] = await Promise.all([
    supabase
      .from("classroom_members")
      .select("user_id, profiles(id, display_name)")
      .eq("classroom_id", classroomId)
      .eq("role", "student"),
    supabase.from("grade_categories").select("*").eq("classroom_id", classroomId).order("position"),
    supabase.from("grade_items").select("*").eq("classroom_id", classroomId).order("position"),
    supabase.from("gradebook_settings").select("*").eq("classroom_id", classroomId).maybeSingle(),
  ]);

  const students = (roster ?? [])
    .map((r: any) => ({ id: r.profiles?.id as string, name: (r.profiles?.display_name as string) ?? "Student" }))
    .filter((s) => s.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  const itemIds = (items ?? []).map((i: any) => i.id);
  const { data: entries } = itemIds.length
    ? await supabase.from("grade_entries").select("grade_item_id,student_id,points,exempt,feedback_md").in("grade_item_id", itemIds)
    : { data: [] as any[] };

  // Assignments this teacher owns that aren't already a column in this gradebook —
  // candidates for one-click import into the gradebook.
  const linkedAssignmentIds = new Set(
    (items ?? []).map((i: any) => i.assignment_id).filter(Boolean) as string[],
  );
  const { data: myAssignments } = await supabase
    .from("assignments")
    .select("id,title,max_score")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });
  const importableAssignments = (myAssignments ?? []).filter((a: any) => !linkedAssignmentIds.has(a.id));

  const mode = (settings?.mode ?? "points") as "points" | "weighted";
  const scheme = (settings?.scheme ?? undefined) as SchemeBand[] | undefined;
  const categories = (cats ?? []) as GradeCategory[];
  const gItems = (items ?? []) as GradeItem[];

  const catWeightSum = categories.reduce((n, c) => n + (c.weight || 0), 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/school/${classroom.org_id}/classrooms/${classroomId}`} className="text-sm text-brand-500">← Classroom</Link>
          <h1 className="mt-1 text-2xl font-bold">Gradebook — {classroom.name}</h1>
          <p className="text-sm text-ink-500">{students.length} students · {gItems.length} grade items · {mode} grading</p>
        </div>
        {gItems.length > 0 && students.length > 0 && (
          <a
            href={`/teach/classrooms/${classroomId}/gradebook/export`}
            className="btn-ghost text-sm"
            download
          >
            ⭳ Export CSV
          </a>
        )}
      </header>

      {/* Settings */}
      <section className="card space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Settings</p>
        <div className="flex flex-wrap items-center gap-4">
          <form
            action={async (fd: FormData) => {
              "use server";
              await updateGradebookSettings({ classroomId, mode: (String(fd.get("mode")) as "points" | "weighted") });
            }}
            className="flex items-center gap-2"
          >
            <label className="text-sm">Grading mode</label>
            <select name="mode" defaultValue={mode} className="rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5">
              <option value="points">Points (earned / possible)</option>
              <option value="weighted">Weighted (by category)</option>
            </select>
            <button className="btn-ghost text-xs">Save</button>
          </form>
          <form
            action={async (fd: FormData) => {
              "use server";
              await updateGradebookSettings({ classroomId, showClassAverage: fd.get("show") === "on" });
            }}
            className="flex items-center gap-2"
          >
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="show" defaultChecked={!!settings?.show_class_average} /> Show class average to students
            </label>
            <button className="btn-ghost text-xs">Save</button>
          </form>
        </div>
        {mode === "weighted" && (
          <p className={`text-xs ${catWeightSum === 100 ? "text-ink-500" : "text-amber-600"}`}>
            Category weights total {catWeightSum}%{catWeightSum !== 100 ? " — they should add up to 100%." : "."}
          </p>
        )}
      </section>

      {/* Categories */}
      <section className="card space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Categories</p>
        {categories.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-full bg-black/5 px-3 py-1 text-sm">
                <span>{c.name}{mode === "weighted" ? ` · ${c.weight}%` : ""}</span>
                <form action={deleteCategory}>
                  <input type="hidden" name="classroomId" value={classroomId} />
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-ink-400 hover:text-red-600" aria-label="Delete category">✕</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addCategory} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="classroomId" value={classroomId} />
          <label className="text-sm">
            <span className="block text-xs text-ink-500">Name</span>
            <input name="name" required placeholder="e.g. Tests" className="rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5" />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-ink-500">Weight %</span>
            <input name="weight" type="number" min={0} max={100} defaultValue={0} className="w-24 rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5" />
          </label>
          <button className="btn-ghost text-sm">Add category</button>
        </form>
      </section>

      {/* Add grade item */}
      <section className="card space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Add grade item</p>
        <form action={addItem} className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <input type="hidden" name="classroomId" value={classroomId} />
          <label className="col-span-2 text-sm">
            <span className="block text-xs text-ink-500">Name</span>
            <input name="name" required placeholder="e.g. Unit 3 Test" className="w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5" />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-ink-500">Out of</span>
            <input name="maxPoints" type="number" min={1} defaultValue={100} className="w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5" />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-ink-500">Category</span>
            <select name="categoryId" className="w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5">
              <option value="">(none)</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs text-ink-500">Type</span>
            <select name="type" defaultValue="manual" className="w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5">
              {["manual", "assignment", "quiz", "paper", "participation", "project"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs text-ink-500">Due</span>
            <input name="dueAt" type="date" className="w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5" />
          </label>
          <div className="col-span-2 sm:col-span-6">
            <button className="btn-primary text-sm">Add item</button>
          </div>
        </form>
      </section>

      {/* Import from an assignment */}
      {importableAssignments.length > 0 && (
        <section className="card space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Import from an assignment</p>
            <p className="text-xs text-ink-400">
              Adds the assignment as a gradebook column and pulls in each student&apos;s reviewed score
              (or the AI grade if you haven&apos;t reviewed yet). Re-sync anytime from Manage items below.
            </p>
          </div>
          <form action={importAssignment} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="classroomId" value={classroomId} />
            <label className="text-sm">
              <span className="block text-xs text-ink-500">Assignment</span>
              <select name="assignmentId" required className="w-72 max-w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5">
                {importableAssignments.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.title} (/{a.max_score ?? 100})</option>
                ))}
              </select>
            </label>
            <button className="btn-ghost text-sm">Import &amp; sync grades</button>
          </form>
        </section>
      )}

      {/* The grid */}
      {gItems.length === 0 || students.length === 0 ? (
        <p className="card text-sm text-ink-500">
          {students.length === 0 ? "No students in this classroom yet." : "Add a grade item above to start grading."}
        </p>
      ) : (
        <GradebookGrid
          classroomId={classroomId}
          students={students}
          items={gItems}
          categories={categories}
          mode={mode}
          scheme={scheme}
          initialEntries={(entries ?? []).map((e: any) => ({ grade_item_id: e.grade_item_id, student_id: e.student_id, points: e.points }))}
        />
      )}

      {/* Item admin (publish/delete) */}
      {gItems.length > 0 && (
        <section className="card space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Manage items</p>
          <ul className="divide-y divide-black/5">
            {gItems.map((i: any) => (
              <li key={i.id} className="flex items-center justify-between py-1.5 text-sm">
                <span>
                  {i.name} <span className="text-xs text-ink-400">/ {i.max_points}{i.category_id ? "" : " · uncategorized"}</span>
                  {i.assignment_id && <span className="ml-1 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-600 dark:bg-brand-500/15">linked</span>}
                </span>
                <span className="flex items-center gap-2">
                  {i.assignment_id && (
                    <form action={syncAssignmentItem}>
                      <input type="hidden" name="classroomId" value={classroomId} />
                      <input type="hidden" name="id" value={i.id} />
                      <button className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-ink-600 hover:bg-black/10" title="Re-pull latest grades from the assignment">
                        ↻ Sync
                      </button>
                    </form>
                  )}
                  <form action={toggleItemPublished}>
                    <input type="hidden" name="classroomId" value={classroomId} />
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="published" value={String(!i.published)} />
                    <button className={`rounded-full px-2 py-0.5 text-xs ${i.published ? "bg-green-100 text-green-700" : "bg-black/10 text-ink-600"}`}>
                      {i.published ? "Published" : "Draft"}
                    </button>
                  </form>
                  <form action={deleteItem}>
                    <input type="hidden" name="classroomId" value={classroomId} />
                    <input type="hidden" name="id" value={i.id} />
                    <button className="text-ink-400 hover:text-red-600" aria-label="Delete item">✕</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
