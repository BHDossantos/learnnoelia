import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessments" };

export default async function StudentAssessmentsPage() {
  await requireOnboardedUser();
  const supabase = await supabaseServer();

  // RLS returns only published assessments in the student's classrooms, and only
  // the student's own attempt via the embed.
  const { data: assessments } = await supabase
    .from("assessments")
    .select("id,title,total_points,time_limit_minutes,assessment_attempts(status,score,max_score,published)")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const rows = assessments ?? [];

  function statusChip(a: any) {
    const at = Array.isArray(a.assessment_attempts) ? a.assessment_attempts[0] : a.assessment_attempts;
    if (!at) return { label: "Not started", cls: "bg-brand-50 text-brand-700" };
    if (at.status === "in_progress") return { label: "In progress", cls: "bg-amber-50 text-amber-700" };
    if (at.status === "submitted") return { label: "Submitted — under review", cls: "bg-black/5 text-ink-600" };
    if (at.status === "graded" && at.published)
      return { label: `${Math.round((at.score / Math.max(1, at.max_score)) * 100)}%`, cls: "bg-green-100 text-green-700" };
    return { label: "Graded", cls: "bg-green-50 text-green-700" };
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Assessments</h1>
        <p className="text-sm text-ink-500">Exams assigned to your classes.</p>
      </header>

      {rows.length === 0 ? (
        <p className="card text-sm text-ink-500">No assessments assigned to you yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((a: any) => {
            const chip = statusChip(a);
            return (
              <li key={a.id}>
                <Link href={`/assessments/${a.id}`} className="card flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.title}</p>
                    <p className="text-xs text-ink-500">
                      {a.total_points} pts{a.time_limit_minutes ? ` · ${a.time_limit_minutes} min` : " · untimed"}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.cls}`}>{chip.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
