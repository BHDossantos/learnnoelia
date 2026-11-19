import { CourseAssessmentCatalog } from "@/components/learning/CourseAssessmentCatalog";
import { CourseFlashcards } from "@/components/learning/CourseFlashcards";
import { studyCourse } from "@/lib/study-course-server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { ReviewSession } from "./ReviewSession";
import { requireOnboardedUser } from "@/lib/auth";
import { countDueRetention } from "@/lib/retention";

export const dynamic = "force-dynamic";

export default async function ReviewPage({searchParams}:{searchParams:Promise<{course?:string;mode?:string}>}) {
  const params=await searchParams;
  const user = await requireOnboardedUser();
  const supabase = await supabaseServer();

  if(params.course){
    if(!/^[0-9a-f-]{36}$/i.test(params.course))notFound();
    const data=await studyCourse(params.course);if(!data)notFound();
    const cards=data.bank.map(q=>({id:q.id,front:q.prompt,back:q.options?`${q.options[q.answer as number]}\n\n${q.explanation}`:String(q.answer),lessonId:q.lessonId}));
    return <CourseFlashcards key={data.course.id} courseId={data.course.id} title={data.course.title} cards={cards}/>;
  }
  if(params.mode!=="daily"){
    const {data:courses}=await supabase.from("courses").select("id,title,school").eq("published",true).order("title");
    return <div className="space-y-5"><h1 className="text-2xl font-bold">Flashcards by topic</h1><CourseAssessmentCatalog courses={courses??[]} mode="flashcards"/><Link href="/review?mode=daily" className="btn-ghost">Open my scheduled language review</Link></div>;
  }
  const dueRetention = await countDueRetention();

  const { data: dueCards } = await supabase
    .from("srs_cards")
    .select("id,due_at,vocab:vocab_items(id,language,dialect,term,translation,ipa,example_sentence)")
    .eq("user_id", user.id)
    .lte("due_at", new Date().toISOString())
    .order("due_at")
    .limit(40);

  const cards = (dueCards ?? [])
    .map((c: any) => c.vocab && {
      cardId: c.id,
      language: c.vocab.language,
      dialect: c.vocab.dialect,
      term: c.vocab.term,
      translation: c.vocab.translation,
      ipa: c.vocab.ipa,
      example: c.vocab.example_sentence,
    })
    .filter(Boolean);

  return (
    <div className="space-y-4">
      <header>
        <Link href="/review" className="text-sm text-brand-600">← Topic flashcards</Link>
        <h1 className="text-2xl font-bold">Scheduled language review</h1>
        <p className="text-sm text-ink-500">
          {cards.length} card{cards.length === 1 ? "" : "s"} due. Mastery, not streaks.
        </p>
      </header>

      {dueRetention > 0 && (
        <Link
          href="/retention"
          className="card flex items-center justify-between gap-3 border-brand-500/30 bg-gradient-to-br from-brand-50 to-white transition hover:ring-1 hover:ring-brand-500/40 dark:from-white/[0.06] dark:to-transparent"
        >
          <div>
            <p className="text-sm font-semibold">🧠 Retention check ready</p>
            <p className="text-xs text-ink-500">
              {dueRetention} mastered skill{dueRetention === 1 ? "" : "s"} due for a 14-day check — prove it still sticks.
            </p>
          </div>
          <span className="shrink-0 text-brand-500">→</span>
        </Link>
      )}

      {cards.length === 0 ? (
        <div className="card text-sm">
          🎯 Nothing due. <Link href="/learn" className="text-brand-500">Start a new lesson</Link> to keep growing your queue.
        </div>
      ) : (
        <ReviewSession cards={cards} />
      )}
    </div>
  );
}
