import { MarkingWorkspace } from "@/components/MarkingWorkspace";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Graded report" };

type Annotation = { label?: string; correct?: boolean; detail?: string; correct_answer?: string };

// A printable, teacher-style marked-up report: each question shown with a green
// check (correct) or a red X (wrong) plus the right answer, then the feedback
// summary, focus areas, and study plan. RLS limits reads to the student, their
// teachers, and their guardians.
export default async function PrintPaperPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  await requireOnboardedUser();
  const supabase = await supabaseServer();

  const { data: paper } = await supabase
    .from("paper_gradings")
    .select(
      "id,title,subject,source,score,max_score,summary_md,feedback_md,focus_areas,plan_md,annotations,created_at,student:profiles!paper_gradings_student_id_fkey(display_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!paper) notFound();

  const studentName = (paper as any).student?.display_name ?? "Student";
  const pct = paper.max_score ? Math.round((Number(paper.score) / Number(paper.max_score)) * 100) : null;
  const annotations: Annotation[] = Array.isArray(paper.annotations) ? (paper.annotations as Annotation[]) : [];
  const focus: string[] = Array.isArray(paper.focus_areas) ? (paper.focus_areas as string[]) : [];
  const correctCount = annotations.filter((a) => a.correct).length;

  return (
    <div className="report mx-auto max-w-3xl p-6 print:p-0">
      <style>{`
        @media print {
          nav, header.app-header, .no-print { display: none !important; }
          .report { max-width: 100% !important; }
          body { background: #fff !important; }
        }
        .mark-correct { color: #15803d; }
        .mark-wrong { color: #dc2626; }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between">
        <a href={`/papers/${paper.id}`} className="text-sm text-brand-500">← Back</a>
        <PrintButton />
      </div>

      {/* Report header */}
      <div className="flex items-start justify-between gap-4 border-b-2 border-black/80 pb-3">
        <div>
          <h1 className="text-2xl font-bold">{paper.title ?? "Graded paper"}</h1>
          <p className="text-sm text-ink-600">
            Name: <span className="font-semibold">{studentName}</span>
            {paper.subject ? ` · ${paper.subject}` : ""}
            {" · "}
            {new Date(paper.created_at as string).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-3xl font-extrabold">
            {paper.score}
            <span className="text-lg font-normal text-ink-500">/{paper.max_score}</span>
          </p>
          {pct !== null && <p className="text-sm font-semibold">{pct}%</p>}
          {annotations.length > 0 && (
            <p className="text-xs text-ink-500">
              {correctCount}/{annotations.length} correct
            </p>
          )}
        </div>
      </div>

      {paper.summary_md && <p className="mt-4 text-sm leading-relaxed">{paper.summary_md}</p>}

      <MarkingWorkspace kind="paper" targetId={paper.id as string} readOnly />

      {/* Marked-up questions */}
      {annotations.length > 0 && (
        <section className="mt-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Marked answers</h2>
          <ul className="mt-2 divide-y divide-black/10">
            {annotations.map((a, i) => (
              <li key={i} className="flex items-start gap-3 py-2">
                <span className={`mt-0.5 text-xl font-black ${a.correct ? "mark-correct" : "mark-wrong"}`}>
                  {a.correct ? "✓" : "✗"}
                </span>
                <div className="text-sm">
                  <span className="font-semibold">{a.label ?? `Item ${i + 1}`}</span>
                  {a.detail ? <span className="text-ink-700"> — {a.detail}</span> : null}
                  {!a.correct && a.correct_answer ? (
                    <div className="mt-0.5 text-xs text-ink-600">
                      Correct answer: <span className="font-medium">{a.correct_answer}</span>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Feedback */}
      {paper.feedback_md && (
        <section className="mt-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Feedback</h2>
          <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{paper.feedback_md}</div>
        </section>
      )}

      {/* Focus areas */}
      {focus.length > 0 && (
        <section className="mt-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Areas to improve</h2>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {focus.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Study plan */}
      {paper.plan_md && (
        <section className="mt-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Study plan</h2>
          <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{paper.plan_md}</div>
        </section>
      )}
    </div>
  );
}
