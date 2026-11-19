"use server";
import { rateCardForUser, type RateInput } from "@/lib/srs-server";
import { supabaseServer } from "@/lib/supabase/server";
import { XP } from "@/lib/gamification";
import { recordMasteryEvent } from "@/lib/mastery";

export async function rateCardAction(input: RateInput) {
  const result = await rateCardForUser(input);
  const supabase = await supabaseServer();
  // Best-effort XP — a failed award must never break the review itself.
  await supabase.rpc("award_xp", { p_amount: XP.cardReview, p_kind: "card_review" });
  return result;
}

// Item analysis (spec §8): record one quiz answer's correctness into the
// aggregate question_stats. Fire-and-forget; needs migration 0036.
export async function logQuizAnswer(lessonId: string, qIndex: number, prompt: string, correct: boolean) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.rpc("bump_question_stat", {
      p_lesson: lessonId,
      p_index: qIndex,
      p_prompt: (prompt ?? "").slice(0, 300),
      p_correct: correct,
    });
  } catch {
    // stats table not migrated — ignore.
  }
}

export async function completeLessonAction(lessonId: string, score: number) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to save your progress.");

  const { data: lesson } = await supabase
    .from("lessons").select("course_id").eq("id", lessonId).single();

  const { error: progressError } = await supabase
    .from("lesson_progress")
    .upsert({
      user_id: user.id,
      lesson_id: lessonId,
      completed_at: new Date().toISOString(),
      score,
    });

  if (progressError) throw new Error("Could not save lesson progress.");

  // Feed the mastery engine: this lesson's score becomes evidence toward a
  // skill state (introduced → developing → proficient → mastered). Best-effort.
  await recordMasteryEvent({
    skillId: lessonId,
    skillKind: "lesson",
    eventType: "lesson_complete",
    score: typeof score === "number" ? (score > 1 ? score / 100 : score) : undefined,
  });

  if (lesson?.course_id) {
    await supabase
      .from("enrollments")
      .upsert(
        { user_id: user.id, course_id: lesson.course_id, role: "student" },
        { onConflict: "user_id,course_id", ignoreDuplicates: true },
      );
  }

  const { data: award } = await supabase.rpc("award_xp", {
    p_amount: XP.lessonComplete,
    p_kind: "lesson_complete",
  });
  return award?.[0] ?? null;
}

// Record a completed online TEST (a gated checkpoint/final quiz) so the student's
// teachers and parents are notified — with the score, the topics missed as focus
// areas, and a concrete plan. Reuses the paper_gradings fan-out trigger (which
// notifies student + teachers + guardians). Best-effort; needs migration 0040.
export async function recordTestResultAction(
  lessonId: string,
  score: number,
  missedTopics: string[],
) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: lesson } = await supabase
      .from("lessons")
      .select("title, course:courses(title)")
      .eq("id", lessonId)
      .single();
    const courseTitle = (lesson as any)?.course?.title ?? null;
    const focus = (missedTopics ?? []).map((t) => (t || "").slice(0, 120)).filter(Boolean).slice(0, 6);

    const plan =
      focus.length > 0
        ? [
            "- Review the lesson and the questions you missed above.",
            "- Ask the coach to re-explain each focus-area topic in your own words.",
            "- Retake the checkpoint to confirm you've got it.",
            "- Then move on to the next lesson.",
          ].join("\n")
        : [
            "- Strong result — keep the momentum.",
            "- Move on to the next lesson, and let spaced review bring this back later.",
          ].join("\n");

    await supabase.from("paper_gradings").insert({
      student_id: user.id,
      graded_by: user.id,
      title: (lesson as any)?.title ?? "Online test",
      subject: courseTitle,
      source: "typed",
      score,
      max_score: 100,
      feedback_md:
        score >= 70
          ? `You scored ${score}% on this test.`
          : `You scored ${score}% — below the pass mark. Focus on the topics below and retake it.`,
      focus_areas: focus,
      plan_md: plan,
    });
  } catch {
    // paper_gradings not migrated, or notify path unavailable — ignore.
  }
}
