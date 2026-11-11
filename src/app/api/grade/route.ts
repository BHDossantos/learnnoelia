import { NextResponse } from "next/server";
import { z } from "zod";
import { anthropic, MODEL } from "@/lib/anthropic";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Body = z.object({ submissionId: z.string().uuid() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: submission } = await supabase
    .from("submissions")
    .select("id,text,student_id,assignment:assignments(id,title,instructions_md,rubric,max_score,kind,language,teacher_id)")
    .eq("id", parsed.data.submissionId)
    .single();
  if (!submission) return NextResponse.json({ error: "not found" }, { status: 404 });

  const assignment = (submission as any).assignment;
  if (!assignment) return NextResponse.json({ error: "assignment missing" }, { status: 400 });
  if (user.id !== submission.student_id && user.id !== assignment.teacher_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rubric: Array<{ name: string; weight: number; description?: string }> =
    Array.isArray(assignment.rubric) && assignment.rubric.length > 0
      ? assignment.rubric
      : [
          { name: "Task completion", weight: 0.3, description: "Did the student address the prompt?" },
          { name: "Clarity & structure", weight: 0.3, description: "Logical flow, paragraphing." },
          { name: "Language accuracy", weight: 0.25, description: "Grammar, spelling, mechanics." },
          { name: "Depth & insight", weight: 0.15, description: "Originality, evidence, reasoning." },
        ];

  const system = `You are a fair, rigorous teacher grading a student's ${assignment.kind} submission.
Title: ${assignment.title}
Instructions:
${assignment.instructions_md}
${assignment.language ? `Target language: ${assignment.language}` : ""}
Max score: ${assignment.max_score}

Score each criterion below on its own scale, then compute the weighted total to max_score.
Criteria (JSON): ${JSON.stringify(rubric)}

Return STRICT JSON only:
{
  "criteria": [{"name": string, "score": number, "max": number, "feedback": string}],
  "score": number,
  "max_score": ${assignment.max_score},
  "feedback_md": string,
  "confidence": number (0-1)
}
"feedback_md" is constructive, addressed to the student, ~200 words, with 2-3 concrete improvements.`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1400,
    system,
    messages: [{ role: "user", content: submission.text ?? "(no submission text)" }],
  });

  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");

  let parsedGrade: any;
  try { parsedGrade = JSON.parse(raw); }
  catch {
    return NextResponse.json({ error: "could not parse grade", raw }, { status: 502 });
  }

  const { data: grade, error } = await supabase
    .from("ai_grades")
    .insert({
      submission_id: submission.id,
      score: parsedGrade.score,
      max_score: parsedGrade.max_score ?? assignment.max_score,
      feedback_md: parsedGrade.feedback_md,
      criteria: parsedGrade.criteria,
      confidence: parsedGrade.confidence,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: statusErr } = await supabase
    .from("submissions")
    .update({ status: "graded" })
    .eq("id", submission.id);
  if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 });

  return NextResponse.json({ grade });
}
