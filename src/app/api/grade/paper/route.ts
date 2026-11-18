import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { buildPaperGradingSystem } from "@/lib/grading";

export const runtime = "nodejs";
export const maxDuration = 60;

// A scan/photo of a paper (base64, no data: prefix) or typed answers. Either
// `text`, `image`, or a PDF `document` is required.
const Body = z.object({
  studentId: z.string().guid().optional(), // omit to grade your own work
  title: z.string().max(200).optional(),
  subject: z.string().max(120).optional(),
  maxScore: z.number().int().min(1).max(1000).optional(),
  answerKey: z.string().max(8000).optional(),
  text: z.string().max(20000).optional(),
  document: z.object({ media_type: z.literal("application/pdf"), data: z.string().min(1).max(4_194_304) }).optional(),
  image: z
    .object({
      media_type: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      data: z.string().min(1).max(4_194_304), // base64, at most 3MB
    })
    .optional(),
});

// Grade a whole paper/test — typed, or read from a scan/photo via vision — and
// file the result. The DB trigger then notifies the student, their teachers, and
// their guardians, each with the score, feedback, focus areas, and a plan.
// Requires ANTHROPIC_API_KEY; returns a retryable 503 when unconfigured.
export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Could not read the upload. Please select the file again." }, { status: 400 }); }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload. Use a PDF, JPEG, PNG, WebP, or GIF up to 3 MB, and a score between 1 and 1000." }, { status: 400 });
  }
  const { studentId, title, subject, maxScore, answerKey, text, image, document } = parsed.data;
  if (!text?.trim() && !image && !document) {
    return NextResponse.json({ error: "Provide the paper as text, a PDF, or an image." }, { status: 400 });
  }

  if (document && !Buffer.from(document.data, "base64").subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
    return NextResponse.json({ error: "This file is not a readable PDF. Export it as a PDF and try again." }, { status: 400 });
  }
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Who is this paper for? Self by default; a teacher may file for a student
  // they teach (verified via the teaches_student RPC).
  const targetStudent = studentId ?? user.id;
  if (targetStudent !== user.id) {
    const { data: allowed } = await supabase.rpc("teaches_student", { student: targetStudent });
    if (!allowed) return NextResponse.json({ error: "You don't teach this student." }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Automatic grading is currently unavailable. Your paper has not been saved; please try again later." }, { status: 503 });
  }

  const { takeRateLimit } = await import("@/lib/rate-limit");
  if (!(await takeRateLimit(`paper:${user.id}`, 60, 3600))) {
    return NextResponse.json({ error: "Too many gradings right now — try again shortly." }, { status: 429 });
  }

  const system = buildPaperGradingSystem({ subject, maxScore, answerKey, fromImage: !!image, fromPdf: !!document, withAnnotations: true });

  // Build the user message: an image block (vision) and/or the typed text.
  const content: any[] = [];
  if (document) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: document.data } });
  if (image) {
    content.push({ type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } });
  }
  content.push({ type: "text", text: text ? text : "Grade the attached paper." });

  const { anthropic, MODEL } = await import("@/lib/anthropic");
  let raw = "";
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system,
      messages: [{ role: "user", content }],
    }, { timeout: 45_000, maxRetries: 0 });
    raw = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
  } catch (err: any) {
    return NextResponse.json({ error: "The grading service could not process the paper. Please try again. No grade was saved." }, { status: 502 });
  }

  // Tolerate a stray code fence around the JSON.
  const jsonText = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let g: any;
  try { g = JSON.parse(jsonText); }
  catch { return NextResponse.json({ error: "The grading response was incomplete. Please try again. No grade was saved." }, { status: 502 }); }

  if (!Number.isFinite(g?.score) || g.score < 0 || g.score > (maxScore ?? 100) || g.max_score !== (maxScore ?? 100)) {
    return NextResponse.json({ error: "The grading response had an invalid score. Please try again. No grade was saved." }, { status: 502 });
  }
  const { data: saved, error } = await supabase
    .from("paper_gradings")
    .insert({
      student_id: targetStudent,
      graded_by: user.id,
      title: title ?? subject ?? "Paper",
      subject: subject ?? null,
      source: document ? "pdf" : image ? "image" : "typed",
      annotations: Array.isArray(g.annotations) ? g.annotations.slice(0, 100) : null,
      raw_text: typeof g.transcribed === "string" ? g.transcribed : text ?? null,
      score: typeof g.score === "number" ? g.score : null,
      max_score: typeof g.max_score === "number" ? g.max_score : (maxScore ?? 100),
      feedback_md: [g.summary_md, g.feedback_md].filter(Boolean).join("\n\n") || null,
      focus_areas: Array.isArray(g.focus_areas) ? g.focus_areas.slice(0, 8) : null,
      plan_md: typeof g.plan_md === "string" ? g.plan_md : null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The insert trigger notified the student, their teachers, and their guardians.
  return NextResponse.json({ id: saved.id, grade: g });
}
