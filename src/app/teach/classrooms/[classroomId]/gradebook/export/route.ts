import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  computeFinalGrade,
  itemResults,
  type GradeCategory,
  type GradeItem,
  type SchemeBand,
} from "@/lib/gradebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Quote a CSV cell (RFC 4180): wrap in quotes and double any inner quotes.
function csv(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /teach/classrooms/[classroomId]/gradebook/export — full gradebook as CSV.
// One row per student: each grade item's points, then final %, letter, and GPA.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ classroomId: string }> },
) {
  const { classroomId } = await ctx.params;
  const supabase = await supabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  const { data: isTeacher } = await supabase.rpc("is_classroom_teacher", { p_classroom: classroomId });
  if (!isTeacher) return new NextResponse("Forbidden", { status: 403 });

  const [{ data: classroom }, { data: roster }, { data: cats }, { data: items }, { data: settings }] =
    await Promise.all([
      supabase.from("classrooms").select("name").eq("id", classroomId).maybeSingle(),
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

  const categories = (cats ?? []) as GradeCategory[];
  const gItems = (items ?? []) as GradeItem[];
  const mode = (settings?.mode ?? "points") as "points" | "weighted";
  const scheme = (settings?.scheme ?? undefined) as SchemeBand[] | undefined;

  const itemIds = gItems.map((i) => i.id);
  const { data: entries } = itemIds.length
    ? await supabase
        .from("grade_entries")
        .select("grade_item_id,student_id,points,exempt")
        .in("grade_item_id", itemIds)
    : { data: [] as any[] };
  const byStudent = new Map<string, { grade_item_id: string; points: number | null; exempt?: boolean }[]>();
  for (const e of (entries ?? []) as any[]) {
    if (!byStudent.has(e.student_id)) byStudent.set(e.student_id, []);
    byStudent.get(e.student_id)!.push({ grade_item_id: e.grade_item_id, points: e.points, exempt: e.exempt });
  }

  // Header: Student, <item (/max)> ..., Final %, Letter, GPA.
  const header = ["Student", ...gItems.map((i) => `${i.name} (/${i.max_points})`), "Final %", "Letter", "GPA"];
  const lines = [header.map(csv).join(",")];

  for (const student of students) {
    const studentEntries = byStudent.get(student.id) ?? [];
    const results = itemResults(gItems, studentEntries);
    const byItem = new Map(results.map((r) => [r.item.id, r]));
    const final = computeFinalGrade({ mode, categories, items: gItems, entries: studentEntries, scheme });
    const cells: (string | number)[] = [student.name];
    for (const item of gItems) {
      const r = byItem.get(item.id);
      cells.push(r?.exempt ? "EX" : r?.graded && r.points != null ? r.points : "");
    }
    cells.push(final.percent == null ? "" : final.percent, final.letter ?? "", final.gpa == null ? "" : final.gpa);
    lines.push(cells.map(csv).join(","));
  }

  const slug = (classroom?.name ?? "gradebook").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  const body = "﻿" + lines.join("\r\n") + "\r\n"; // BOM so Excel reads UTF-8

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug || "gradebook"}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
