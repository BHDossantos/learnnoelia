import { NextResponse } from "next/server";
import { z } from "zod";
import { anthropic, MODEL } from "@/lib/anthropic";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Body = z.object({ submissionId: z.string().guid() });

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
    .select("id,text,assignment:assignments(teacher_id)")
    .eq("id", parsed.data.submissionId)
    .single();
  if (!submission) return NextResponse.json({ error: "not found" }, { status: 404 });
  const teacherId = (submission as any).assignment?.teacher_id as string | undefined;
  if (user.id !== teacherId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!submission.text || submission.text.trim().length < 20) {
    return NextResponse.json({ error: "submission too short to check" }, { status: 400 });
  }

  // 1) Cohort similarity via pg_trgm.
  const { data: simRows } = await supabase.rpc("max_submission_similarity", {
    p_submission_id: submission.id,
  });
  const sim = Array.isArray(simRows) && simRows.length > 0 ? simRows[0] : null;

  // 2) AI-likelihood estimate.
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: `You assess whether a student's text was likely written by an AI model.
Consider register uniformity, hedging patterns, generic structure, absence of
personal voice, and unnatural fluency for a student. You are NOT certain — give
a calibrated probability. Return STRICT JSON only:
{"ai_likelihood": number 0..1, "reasoning": string (one or two sentences)}`,
    messages: [{ role: "user", content: submission.text }],
  });
  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let ai: { ai_likelihood: number; reasoning: string };
  try {
    ai = JSON.parse(raw);
  } catch {
    ai = { ai_likelihood: 0, reasoning: "Could not parse model response." };
  }

  const { data: check, error } = await supabase
    .from("integrity_checks")
    .insert({
      submission_id: submission.id,
      ai_likelihood: ai.ai_likelihood,
      ai_reasoning: ai.reasoning,
      similarity_max: sim?.similarity ?? null,
      similar_submission_id: sim?.similar_submission_id ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ check });
}
