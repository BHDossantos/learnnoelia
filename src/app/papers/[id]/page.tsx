import { MarkingWorkspace } from "@/components/MarkingWorkspace";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { PaperActions } from "./PaperActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Graded paper" };

// A graded paper's full result. RLS lets the student, their teachers, and their
// guardians read it; anyone else gets a 404. Shows the score, detailed feedback,
// focus areas, and the next-steps plan (spec §8/§14/§15).
export default async function PaperPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  await requireOnboardedUser();
  const supabase = await supabaseServer();

  const { data: paper } = await supabase
    .from("paper_gradings")
    .select("id,title,subject,source,score,max_score,feedback_md,focus_areas,plan_md,created_at,student_id,student:profiles!paper_gradings_student_id_fkey(display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!paper) notFound();

  const pct = paper.max_score ? Math.round((Number(paper.score) / Number(paper.max_score)) * 100) : null;
  const studentName = (paper as any).student?.display_name ?? "Student";
  const focus: string[] = Array.isArray(paper.focus_areas) ? (paper.focus_areas as string[]) : [];

  // Show the email/print actions only to the student themselves or a teacher who
  // teaches them (the send endpoint enforces the same rule server-side).
  const { data: { user } } = await supabase.auth.getUser();
  let canShare = user?.id === (paper as any).student_id;
  if (!canShare && user) {
    const { data: t } = await supabase.rpc("teaches_student", { student: (paper as any).student_id });
    canShare = !!t;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/" className="text-sm text-brand-500">← Home</Link>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{paper.title ?? "Paper"}</h1>
          <p className="text-sm text-ink-500">
            {studentName}{paper.subject ? ` · ${paper.subject}` : ""}
            {" · "}{new Date(paper.created_at as string).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            {paper.source === "image" ? " · scanned" : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-3xl font-extrabold text-brand-600">{paper.score}<span className="text-lg text-ink-500">/{paper.max_score}</span></p>
          {pct !== null && <p className="text-xs text-ink-500">{pct}%</p>}
        </div>
      </header>

      {canShare && <PaperActions paperId={paper.id as string} />}
      <MarkingWorkspace kind="paper" targetId={paper.id as string} />

      {focus.length > 0 && (
        <section className="card">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Focus on next</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {focus.map((f, i) => (
              <span key={i} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">{f}</span>
            ))}
          </div>
        </section>
      )}

      {paper.feedback_md && (
        <section className="card">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Feedback</p>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{paper.feedback_md}</div>
        </section>
      )}

      {paper.plan_md && (
        <section className="card border-brand-500/20 bg-gradient-to-br from-brand-50 to-white dark:from-white/[0.06] dark:to-transparent">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Your plan — what to do next</p>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{paper.plan_md}</div>
          <Link href="/plan" className="btn-primary mt-3 inline-block text-sm">Open my daily plan →</Link>
        </section>
      )}
    </div>
  );
}
