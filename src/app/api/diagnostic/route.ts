import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const StartBody = z.object({
  action: z.literal("start"),
  subject: z.string().min(2).max(120),
});
const AssessBody = z.object({
  action: z.literal("assess"),
  subject: z.string().min(2).max(120),
  questions: z.array(z.object({
    prompt: z.string(),
    options: z.array(z.string()),
    topic: z.string().optional(),
  })).min(1).max(12),
  answers: z.array(z.number().int()).min(1).max(12),
});
const Body = z.union([StartBody, AssessBody]);

function parseJson(text: string): any | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(cleaned.slice(s, e + 1)); } catch {} }
  return null;
}

// Adaptive diagnostic (spec §1). "start" generates a graduated-difficulty
// assessment for the learner's goal; "assess" turns their answers into a saved
// learner model. Requires ANTHROPIC_API_KEY; 503 + offline flag until set.
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
  if (!(await takeRateLimit(`diag:${user.id}`, 20, 3600))) {
    return NextResponse.json({ error: "Give it a moment — try again shortly." }, { status: 429 });
  }

  const { anthropic, MODEL } = await import("@/lib/anthropic");

  if (parsed.data.action === "start") {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1600,
      system:
        `You are a diagnostic assessment engine. For the given subject/goal, write ` +
        `8 multiple-choice questions of GRADUATED difficulty (easy → hard) that ` +
        `probe prerequisite knowledge and common misconceptions. Do NOT reveal answers. ` +
        `Return STRICT JSON only: ` +
        `{"questions":[{"prompt":"...","options":["a","b","c","d"],"topic":"short-topic-tag","difficulty":1}]} ` +
        `(difficulty 1-5, exactly 4 options each).`,
      messages: [{ role: "user", content: `Subject / goal: ${parsed.data.subject}` }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const data = parseJson(text);
    if (!data?.questions) return NextResponse.json({ error: "Could not build the diagnostic — try again." }, { status: 502 });
    return NextResponse.json({ questions: data.questions });
  }

  // action === "assess"
  const { subject, questions, answers } = parsed.data;
  const combined = questions.map((q, i) => ({
    prompt: q.prompt,
    options: q.options,
    topic: q.topic ?? "",
    chosenIndex: answers[i],
    chosen: q.options[answers[i]] ?? "(no answer)",
  }));
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system:
      `You are a diagnostic assessment analyst. Given the questions and the ` +
      `learner's chosen answers, infer their level and produce a learner model. ` +
      `Judge correctness yourself from subject knowledge. Identify specific ` +
      `misconceptions from wrong choices. Return STRICT JSON only: ` +
      `{"level":"e.g. beginner/A2/intermediate","masteredTopics":["..."],` +
      `"developingTopics":["..."],"gaps":["missing prerequisite ..."],` +
      `"misconceptions":["..."],"recommendation":"one-sentence recommended starting point",` +
      `"estimatedHours":40}`,
    messages: [{
      role: "user",
      content: `Subject / goal: ${subject}\nResponses:\n${JSON.stringify(combined, null, 2)}`,
    }],
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const model = parseJson(text);
  if (!model) return NextResponse.json({ error: "Could not analyze — try again." }, { status: 502 });

  // Placement: match the learner to a real, published course in the catalog so
  // the result ends in a concrete "enroll & start here" rather than a dead end.
  let placement: { courseId: string; title: string; reason: string } | null = null;
  try {
    const tokens = Array.from(new Set((subject.toLowerCase().match(/[a-z0-9]+/g) ?? [])))
      .filter((t) => t.length > 2)
      .slice(0, 5);
    let cq = supabase
      .from("courses")
      .select("id,title,school,cefr_level")
      .eq("published", true);
    if (tokens.length) cq = cq.or(tokens.map((t) => `title.ilike.%${t}%`).join(","));
    let { data: candidates } = await cq.limit(40);
    if (!candidates || candidates.length === 0) {
      // Nothing matched by title — offer a broad slate so placement still works.
      ({ data: candidates } = await supabase
        .from("courses")
        .select("id,title,school,cefr_level")
        .eq("published", true)
        .limit(40));
    }
    if (candidates && candidates.length) {
      const valid = new Set(candidates.map((c: any) => c.id as string));
      const compact = candidates.map((c: any) => ({ id: c.id, title: c.title, school: c.school, level: c.cefr_level }));
      const pick = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 400,
        system:
          `You place a learner into ONE course from a catalog. Given their diagnostic ` +
          `learner model and a list of courses (id, title, school, level), choose the single ` +
          `best-fit course to start with next, matched to their level and gaps. ` +
          `Return STRICT JSON only: {"courseId":"<exact id from the list, or empty string>",` +
          `"reason":"one short sentence: why this course and where to focus first"}. ` +
          `If none is a reasonable fit, return an empty courseId.`,
        messages: [{
          role: "user",
          content: `Subject / goal: ${subject}\nLearner model: ${JSON.stringify(model)}\nCourses:\n${JSON.stringify(compact)}`,
        }],
      });
      const ptext = pick.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const pdata = parseJson(ptext);
      if (pdata?.courseId && valid.has(pdata.courseId)) {
        const chosen = compact.find((c) => c.id === pdata.courseId)!;
        placement = { courseId: pdata.courseId, title: chosen.title, reason: String(pdata.reason ?? "").slice(0, 300) };
      }
    }
  } catch {
    // Placement is best-effort — a failure here never blocks the learner model.
  }

  // Persist the learner model + open misconceptions (best-effort; needs 0033/0030).
  try {
    await supabase.from("diagnostic_results").insert({ user_id: user.id, subject, model });
    const tags: string[] = Array.isArray(model.misconceptions) ? model.misconceptions.slice(0, 10) : [];
    if (tags.length) {
      await supabase.from("misconceptions").insert(
        tags.map((t) => ({ user_id: user.id, tag: String(t).slice(0, 120), description: `From diagnostic: ${subject}` })),
      );
    }
  } catch {
    // diagnostic/mastery tables not migrated yet — still return the model.
  }

  return NextResponse.json({ model, placement });
}
