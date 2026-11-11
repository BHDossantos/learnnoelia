import { NextResponse } from "next/server";
import { z } from "zod";
import { anthropic, MODEL } from "@/lib/anthropic";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Body = z.object({
  courseId: z.string().guid(),
  target: z.enum(["lesson", "assignment"]),
  topic: z.string().min(3).max(400),
  lessonKind: z.enum(["reading", "grammar", "listening", "writing"]).default("reading"),
  assignmentKind: z.enum(["essay", "short_answer", "math", "speaking", "project"]).default("essay"),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { courseId, target, topic, lessonKind, assignmentKind } = parsed.data;

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: course } = await supabase
    .from("courses")
    .select("id,title,kind,subject,language,cefr_level,teacher_id")
    .eq("id", courseId)
    .single();
  if (!course) return NextResponse.json({ error: "course not found" }, { status: 404 });
  if (course.teacher_id !== user.id) {
    return NextResponse.json({ error: "not your course" }, { status: 403 });
  }

  const ctx = `Course: "${course.title}" — subject area: ${course.kind}${
    course.subject ? ` (${course.subject})` : ""
  }. Instruction language: ${course.language}.${
    course.cefr_level ? ` Target CEFR level: ${course.cefr_level}.` : ""
  }`;

  let system: string;
  if (target === "lesson") {
    system = `You write a single ${lessonKind} lesson for a teacher's course.
${ctx}
Pitch the depth and vocabulary to the course level. Be accurate and concrete.

Return STRICT JSON only:
{
  "title": string,
  "content": string,        // 200-450 words of lesson body, plain prose with \\n paragraph breaks
  "key_terms": [{"term": string, "definition": string}],  // 3-6 items, [] if not applicable
  "notes": string           // optional teacher-facing note or "" if none
}`;
  } else {
    system = `You draft a single ${assignmentKind} assignment for a teacher's course.
${ctx}
The assignment must be gradeable from a written submission.

Return STRICT JSON only:
{
  "title": string,
  "instructions_md": string,   // clear task instructions, include word/length expectations
  "rubric": [{"name": string, "weight": number, "description": string}],  // 3-4 criteria, weights sum to 1
  "max_score": number          // typically 100
}`;
  }

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: `Topic: ${topic}` }],
  });

  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let draft: unknown;
  try {
    draft = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "could not parse model output", raw }, { status: 502 });
  }

  return NextResponse.json({ draft });
}
