import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(30),
  mode: z
    .enum(["explain", "socratic", "practice", "review", "example", "different", "challenge", "exam"])
    .default("explain"),
  // Optional lesson context so the tutor can reference the exact screen.
  courseId: z.string().guid().optional(),
  lessonId: z.string().guid().optional(),
});

// Pedagogy per tutor mode.
const MODE_PROMPTS: Record<string, string> = {
  explain:
    "Mode: EXPLAIN. Explain at the student's level with one concrete example and a real-world analogy, then one quick check-for-understanding question.",
  socratic:
    "Mode: SOCRATIC. Never state the answer directly, even if asked. Guide with 2-4 short questions that lead the student to discover it. Acknowledge each attempt, narrow the next question based on their reasoning, confirm only once THEY have said the answer.",
  practice:
    "Mode: PRACTICE. Give practice problems matched to the student's level: one at a time, wait for their answer, grade it with a one-line explanation, then give the next (adapted to their performance).",
  review:
    "Mode: REVIEW. Target the student's weak spots (see their skills that need review below). Re-teach briefly, then drill with 2-3 targeted questions.",
  example:
    "Mode: GIVE AN EXAMPLE. Provide 2-3 concrete, varied worked examples of the concept, each slightly different, then ask the student to try one themselves.",
  different:
    "Mode: EXPLAIN IT DIFFERENTLY. The student didn't get the last explanation. Re-explain using a different representation — an analogy, a picture-in-words, or a story — not the same words louder.",
  challenge:
    "Mode: CHALLENGE ME. Pose a harder, transfer-style problem that applies the concept in a new context. Stretch the student just beyond their current level; scaffold only if they struggle.",
  exam:
    "Mode: EXAM COACH. Act as an exam coach: exam-style questions under realistic constraints, mark schemes, timing tips, and the specific mistakes that lose marks. Be candid about readiness.",
};

// Non-negotiable teaching guardrails (spec §5).
const GUARDRAILS =
  "You are a teacher, not an answer machine. Follow these rules strictly:\n" +
  "- First ask what the student has already tried; diagnose where their reasoning broke down.\n" +
  "- Give the SMALLEST useful hint, then a guiding question. Escalate hints only as they keep trying.\n" +
  "- HINT LADDER (climb one rung at a time, never skip to the end): " +
  "1) encouragement/attention cue -> 2) conceptual prompt -> 3) the relevant rule or formula -> " +
  "4) partial setup -> 5) worked first step -> 6) full explanation, and only after a genuine attempt.\n" +
  "- Never do graded or assessed work FOR the student; coach them to do it themselves.\n" +
  "- After explaining, check understanding and ask the student to explain it back in their own words.\n" +
  "- If you are unsure, say so. Never invent facts, citations, or sources.\n" +
  "- Keep it age-appropriate and safe; refuse unsafe requests kindly.\n" +
  "- Do not advance the student past a concept without evidence they understand it.\n" +
  "- Prefer short, concrete replies with one clear next step.";

// The learning coach: a Socratic tutor that knows the student's level, target,
// mastery state, and misconceptions. Requires ANTHROPIC_API_KEY; returns 503
// with a friendly flag when unconfigured so the UI explains rather than errors.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ offline: true }, { status: 503 });
  }

  const { takeRateLimit } = await import("@/lib/rate-limit");
  if (!(await takeRateLimit(`coach:${user.id}`, 30, 3600))) {
    return NextResponse.json(
      { error: "You're going fast! The coach needs a short break — try again in a bit." },
      { status: 429 },
    );
  }

  const { mode, messages, courseId, lessonId } = parsed.data;

  // Learner model: profile, target, mastery snapshot, and open misconceptions.
  // The mastery/misconception reads are best-effort (tables may be un-migrated).
  const [{ data: profile }, { data: target }] = await Promise.all([
    supabase.from("profiles").select("display_name,cefr_level").eq("id", user.id).single(),
    supabase.from("target_languages").select("language,dialect,cefr_level").eq("user_id", user.id).eq("active", true).limit(1).maybeSingle(),
  ]);

  let mastered = 0, developing = 0, review = 0;
  let misconceptionTags: string[] = [];
  try {
    const [{ data: skills }, { data: misc }] = await Promise.all([
      supabase.from("skill_states").select("status").eq("user_id", user.id),
      supabase.from("misconceptions").select("tag").eq("user_id", user.id).eq("status", "open").limit(8),
    ]);
    for (const s of skills ?? []) {
      if (s.status === "mastered") mastered++;
      else if (["proficient", "developing", "fragile"].includes(s.status as string)) developing++;
      else if (["needs_remediation", "decaying"].includes(s.status as string)) review++;
    }
    misconceptionTags = (misc ?? []).map((m: any) => m.tag).filter(Boolean);
  } catch {
    // mastery tables not migrated yet — proceed without that context.
  }

  let lessonContext = "";
  if (lessonId) {
    const { data: lesson } = await supabase
      .from("lessons").select("title,kind,course:courses(title)").eq("id", lessonId).maybeSingle();
    if (lesson) {
      lessonContext =
        `\nRight now the student is on the lesson "${(lesson as any).title}" ` +
        `(${(lesson as any).kind}) in the course "${(lesson as any).course?.title ?? ""}". ` +
        `Reference this exact content when relevant.`;
    }
  }

  const system =
    `You are Noelia's learning coach — a warm, expert Socratic tutor.\n` +
    `Student: ${profile?.display_name ?? "learner"}, level ${target?.cefr_level ?? profile?.cefr_level ?? "beginner"}` +
    `${target?.language ? `, learning ${target.language}${target.dialect ? ` (${target.dialect})` : ""}` : ""}.\n` +
    `Mastery so far: ${mastered} skills mastered, ${developing} developing, ${review} needing review.` +
    (misconceptionTags.length ? ` Known misconceptions to watch for and gently correct: ${misconceptionTags.join(", ")}.` : "") +
    lessonContext +
    `\n\n${GUARDRAILS}\n\n${MODE_PROMPTS[mode]}`;

  const { anthropic, MODEL } = await import("@/lib/anthropic");
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system,
    messages,
  });

  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();

  // Tutor memory: log the exchange (best-effort; needs migration 0032).
  try {
    await supabase.from("tutor_conversations").insert({
      user_id: user.id,
      mode,
      course_id: courseId ?? null,
      lesson_id: lessonId ?? null,
      messages: [...messages, { role: "assistant", content: text }],
    });
  } catch {
    // table not migrated yet — the reply still returns.
  }

  return NextResponse.json({ reply: text });
}
