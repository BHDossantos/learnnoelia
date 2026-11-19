import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { MatchGame } from "./MatchGame";

export const dynamic = "force-dynamic";
export const metadata = { title: "Match game" };

// Quizlet-style Match: tap a term and its translation to clear the pair, as fast
// as you can. Built from a vocab lesson's items. Active recall + a bit of fun.
export default async function MatchPage(props: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await props.params;
  await requireOnboardedUser();
  const supabase = await supabaseServer();

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id,course_id,title,kind,body")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) notFound();

  const items: { term: string; translation: string }[] = Array.isArray((lesson.body as any)?.items)
    ? (lesson.body as any).items
    : [];
  const pairs = items
    .filter((i) => i?.term && i?.translation)
    .slice(0, 8)
    .map((i, idx) => ({ id: String(idx), term: String(i.term), translation: String(i.translation) }));

  if (pairs.length < 2) {
    return (
      <div className="space-y-3">
        <Link href={`/learn/${lesson.course_id}/${lessonId}`} className="text-sm text-brand-500">← Back to lesson</Link>
        <p className="card text-sm text-ink-500">The Match game needs a vocabulary lesson with at least two pairs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link href={`/learn/${lesson.course_id}/${lessonId}`} className="text-sm text-brand-500">← Back to lesson</Link>
      <MatchGame pairs={pairs} courseId={lesson.course_id} lessonId={lessonId} title={lesson.title} />
    </div>
  );
}
