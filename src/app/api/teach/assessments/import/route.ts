import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { classifyFile, pptxToText } from "@/lib/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

// Import questions from an existing test: a pasted text, or an uploaded image /
// PDF / PowerPoint. The AI parses it into the same secure question + answer-key
// shape the builder uses. Teacher-only; answer keys are written server-side.
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI import is offline — set ANTHROPIC_API_KEY to enable it." }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  const classroomId = String(form.get("classroomId") ?? "");
  const assessmentId = String(form.get("assessmentId") ?? "");
  const pastedText = String(form.get("text") ?? "").trim();
  const file = form.get("file") as File | null;
  if (!classroomId || !assessmentId) return NextResponse.json({ error: "Missing classroom/assessment." }, { status: 400 });

  const { data: isTeacher } = await supabase.rpc("is_classroom_teacher", { p_classroom: classroomId });
  if (!isTeacher) return NextResponse.json({ error: "You don't teach this classroom." }, { status: 403 });
  const { data: assessment } = await supabase.from("assessments").select("id,classroom_id").eq("id", assessmentId).maybeSingle();
  if (!assessment || assessment.classroom_id !== classroomId) return NextResponse.json({ error: "Assessment not found." }, { status: 404 });

  const { takeRateLimit } = await import("@/lib/rate-limit");
  if (!(await takeRateLimit(`assess-import:${user.id}`, 10, 3600))) {
    return NextResponse.json({ error: "Too many imports right now — try again shortly." }, { status: 429 });
  }

  // Build the model input from a file or pasted text.
  const content: any[] = [];
  if (file && file.size > 0) {
    if (file.size > 16 * 1024 * 1024) return NextResponse.json({ error: "File is too large (max 16MB)." }, { status: 413 });
    const buf = Buffer.from(await file.arrayBuffer());
    const kind = classifyFile(file.type, file.name);
    if (kind === "image") {
      const media = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) ? file.type : "image/jpeg";
      content.push({ type: "image", source: { type: "base64", media_type: media, data: buf.toString("base64") } });
      content.push({ type: "text", text: "Extract the exam questions from this image." });
    } else if (kind === "pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } });
      content.push({ type: "text", text: "Extract the exam questions from this PDF." });
    } else if (kind === "pptx") {
      let text = "";
      try { text = await pptxToText(buf); } catch { text = ""; }
      if (!text.trim()) return NextResponse.json({ error: "Could not read text from that PowerPoint." }, { status: 422 });
      content.push({ type: "text", text: `Extract the exam questions from this slide text:\n\n${text.slice(0, 40000)}` });
    } else {
      const text = buf.toString("utf-8");
      if (!text.trim()) return NextResponse.json({ error: "Unsupported file type. Use an image, PDF, PowerPoint, or paste text." }, { status: 415 });
      content.push({ type: "text", text: `Extract the exam questions from this text:\n\n${text.slice(0, 40000)}` });
    }
  } else if (pastedText) {
    content.push({ type: "text", text: `Extract the exam questions from this text:\n\n${pastedText.slice(0, 40000)}` });
  } else {
    return NextResponse.json({ error: "Provide a file or paste the test text." }, { status: 400 });
  }

  const system =
    `You convert an existing test into structured questions. Return STRICT JSON only: an array of objects. ` +
    `Each: {"kind","prompt","points", plus for mcq: "options":["..",".."] and "correct_index"; for truefalse: "correct_index" (0=True,1=False); ` +
    `for short: "correct_text" (use "a|b" for alternatives); for numeric: "correct_number" and "tolerance"; for written: optional "rubric"}. ` +
    `Detect each question's type. If the correct answer is shown or derivable, include its key; otherwise use "written". Preserve original wording. Default points to 1.`;

  const { anthropic, MODEL } = await import("@/lib/anthropic");
  let raw = "";
  try {
    const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 4000, system, messages: [{ role: "user", content }] });
    raw = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
  } catch (err: any) {
    return NextResponse.json({ error: `Import failed: ${err?.message ?? "model error"}` }, { status: 502 });
  }

  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let arr: any[];
  try { arr = JSON.parse(cleaned); }
  catch { const s = cleaned.indexOf("["), e = cleaned.lastIndexOf("]"); try { arr = JSON.parse(cleaned.slice(s, e + 1)); } catch { arr = []; } }
  if (!Array.isArray(arr) || arr.length === 0) return NextResponse.json({ error: "Could not find questions to import — try a clearer file or paste the text." }, { status: 422 });

  const { count } = await supabase.from("assessment_questions").select("id", { count: "exact", head: true }).eq("assessment_id", assessmentId);
  let pos = count ?? 0;
  let added = 0;
  for (const g of arr.slice(0, 40)) {
    const kind = ["mcq", "multi", "truefalse", "short", "numeric", "written"].includes(g?.kind) ? g.kind : "mcq";
    const options = kind === "truefalse" ? ["True", "False"] : ((kind === "mcq" || kind === "multi") && Array.isArray(g.options) ? g.options.slice(0, 8).map(String) : null);
    if (!g?.prompt) continue;
    pos++;
    const { data: q } = await supabase
      .from("assessment_questions")
      .insert({ assessment_id: assessmentId, position: pos, kind, prompt: String(g.prompt).slice(0, 4000), options, points: Number(g.points) || 1 })
      .select("id").single();
    if (!q) continue;
    await supabase.from("assessment_answer_keys").insert({
      question_id: q.id,
      correct_index: (kind === "mcq" || kind === "truefalse") ? (Number(g.correct_index) || 0) : null,
      correct_indices: kind === "multi" && Array.isArray(g.correct_indices) ? g.correct_indices.map((x: any) => Number(x) || 0) : null,
      correct_text: kind === "short" ? String(g.correct_text ?? "") : null,
      correct_number: kind === "numeric" ? (Number(g.correct_number) || 0) : null,
      number_tolerance: kind === "numeric" ? (Number(g.tolerance) || 0) : null,
      rubric: kind === "written" ? String(g.rubric ?? "") : null,
    });
    added++;
  }

  // Recompute total points.
  const { data: qs } = await supabase.from("assessment_questions").select("points").eq("assessment_id", assessmentId);
  const total = (qs ?? []).reduce((s: number, x: any) => s + (Number(x.points) || 0), 0);
  await supabase.from("assessments").update({ total_points: total }).eq("id", assessmentId);

  return NextResponse.json({ added });
}
