// Shared grading logic for the instant-feedback grader (spec §5/§8). Pure and
// testable: no network, no secrets. The route in app/api/grade/instant builds
// its system prompt from here and streams the model's feedback back in real time.

export type RubricCriterion = { name: string; weight?: number; description?: string };

export type FeedbackKind = "essay" | "short_answer" | "code" | "math" | "language" | "general";

export const FEEDBACK_KINDS: FeedbackKind[] = [
  "essay",
  "short_answer",
  "code",
  "math",
  "language",
  "general",
];

export const KIND_LABEL: Record<FeedbackKind, string> = {
  essay: "Essay / writing",
  short_answer: "Short answer",
  code: "Code",
  math: "Math solution",
  language: "Language practice",
  general: "General",
};

// A sensible default rubric when the learner hasn't been given one.
export const DEFAULT_FEEDBACK_RUBRIC: RubricCriterion[] = [
  { name: "Task completion", description: "Does the work fully address what was asked?" },
  { name: "Clarity & structure", description: "Logical flow, organization, easy to follow." },
  { name: "Accuracy & mechanics", description: "Correctness — facts, grammar/spelling, or code that runs." },
  { name: "Depth & reasoning", description: "Evidence, insight, justification, originality." },
];

export function normalizeFeedbackKind(k: unknown): FeedbackKind {
  const s = String(k ?? "").toLowerCase();
  return (FEEDBACK_KINDS as string[]).includes(s) ? (s as FeedbackKind) : "general";
}

// Formative-feedback guardrails: coach, don't do the work; be specific and cite
// the learner's own words; be honest but kind; never invent facts.
const FEEDBACK_GUARDRAILS = [
  "You are a rigorous, encouraging teacher giving FORMATIVE feedback — not rewriting the work for the student.",
  "Be specific: quote the student's own words when praising or flagging something, so they can find it.",
  "Point to HOW to improve (a technique, a question to consider, an example pattern) without handing over a full rewrite or the finished answer.",
  "Be honest and calibrated — do not inflate. But lead with what works, and keep it motivating.",
  "Never invent facts, sources, or citations. If something can't be judged from the text, say so.",
  "Keep it age-appropriate and kind; refuse unsafe content gently.",
];

// Build the system prompt for a single real-time feedback pass. The output is
// human-readable Markdown (streamed), so the student sees feedback appear live.
export function buildInstantFeedbackSystem(opts: {
  task?: string | null;
  kind?: FeedbackKind;
  rubric?: RubricCriterion[];
  language?: string | null;
  maxScore?: number | null;
}): string {
  const kind = opts.kind ?? "general";
  const rubric = opts.rubric && opts.rubric.length ? opts.rubric : DEFAULT_FEEDBACK_RUBRIC;
  const rubricList = rubric
    .map((c) => `- ${c.name}${c.description ? ` — ${c.description}` : ""}`)
    .join("\n");

  const scoreLine = opts.maxScore
    ? `End with a score out of ${opts.maxScore} and one sentence justifying it.`
    : "End with an overall rating (Needs work / Developing / Strong / Excellent) and one sentence justifying it.";

  return [
    `You are Noelia's feedback coach, grading a student's ${kind.replace("_", " ")} submission and giving detailed, real-time feedback.`,
    opts.language ? `The work is in ${opts.language}; assess it as such.` : "",
    opts.task ? `\nThe task the student was given:\n"""\n${opts.task}\n"""` : "\nNo explicit task was provided — infer the intent from the work itself.",
    `\nAssess against this rubric:\n${rubricList}`,
    `\n${FEEDBACK_GUARDRAILS.join("\n")}`,
    `\nRespond in this Markdown structure, and nothing else:`,
    `## Overall`,
    `One or two encouraging, honest sentences.`,
    `## By criterion`,
    `For EACH rubric criterion: a line "**<name>** — <✅ strong | 🟡 developing | 🔴 needs work>: <one specific sentence quoting the work>".`,
    `## What's working`,
    `2–3 specific strengths, each quoting the student's own words.`,
    `## What to improve`,
    `2–4 prioritized, concrete fixes. For each: name the issue, point to where it appears, and say how to approach fixing it (not the finished fix).`,
    `## Your next step`,
    `The single most important thing to do next.`,
    `## Score`,
    scoreLine,
  ]
    .filter(Boolean)
    .join("\n");
}

// Build the system prompt for grading a whole PAPER/TEST — typed, or read from a
// scan/photo via vision. Returns STRICT JSON so the result can be stored and
// used to notify the student, teacher, and parent, with focus areas + a plan.
export function buildPaperGradingSystem(opts: {
  subject?: string | null;
  maxScore?: number | null;
  answerKey?: string | null;
  fromImage?: boolean;
  fromPdf?: boolean;
  // Bulk mode: also read the student's name off the paper, and produce
  // per-question marks for a printable, teacher-style graded report.
  detectName?: boolean;
  withAnnotations?: boolean;
}): string {
  const max = opts.maxScore && opts.maxScore > 0 ? opts.maxScore : 100;
  const lines = [
    `You are a fair, rigorous teacher grading a student's completed ${opts.subject ? opts.subject + " " : ""}test/paper.`,
    opts.fromImage
      ? `The image is a photo or scan of the student's work on ANY surface - a printed test, a notebook page, a whiteboard, loose scrap paper, or even a napkin. Expect messy, cursive, or faint handwriting, rotation, skew, shadows, and glare. FIRST do your best to transcribe the student's answers and working from the image; read messy handwriting charitably and reconstruct the math or text they intended. Ignore the surface itself and any irrelevant background (lines, stains, logos). If the original question is not shown, infer from the work what problem is being solved. If part of the image is genuinely illegible, transcribe what you can and mark the rest as [illegible] rather than inventing an answer - never guess at a grade for something you cannot read.`
      : opts.fromPdf ? `The student's work is attached as a PDF. Read each question and the student's answer from the document. Mark illegible material as [illegible]; never invent an answer.` : `The student's work is provided as text.`,
    opts.detectName
      ? `The student usually writes their name at the top of the paper. Read it and return it as first_name and last_name. If you cannot find a name, return empty strings for both — do NOT guess a name.`
      : "",
    opts.answerKey
      ? `\nGrade against this answer key / rubric:\n"""\n${opts.answerKey}\n"""`
      : `\nNo answer key was provided — grade on correctness and quality using your subject expertise; be explicit about any assumption you make about the expected answer.`,
    `\nGrade out of ${max}. Be specific and cite the student's actual answers. Identify WHY marks were lost. Be honest but encouraging, and never invent facts.`,
    `\nReturn STRICT JSON only (no prose outside the JSON), with this exact shape:`,
    `{`,
  ];
  if (opts.detectName) {
    lines.push(`  "first_name": string,           // the student's first name as written, or ""`);
    lines.push(`  "last_name": string,            // the student's last name as written, or ""`);
  }
  lines.push(`  "transcribed": string,          // what the student wrote (from the image, or echo the text)`);
  lines.push(`  "score": number,                // out of ${max}`);
  lines.push(`  "max_score": ${max},`);
  lines.push(`  "summary_md": string,           // 1-2 sentence overall verdict for the student`);
  lines.push(`  "feedback_md": string,          // detailed, question-by-question feedback addressed to the student (Markdown)`);
  lines.push(`  "focus_areas": string[],        // 3-5 specific topics/skills the student should focus on next`);
  lines.push(`  "plan_md": string,              // a concrete next-steps study plan (Markdown, 3-6 bullet actions)`);
  if (opts.withAnnotations) {
    lines.push(`  "annotations": [                // one entry per question/item, in order, for a printable marked-up report`);
    lines.push(`    {`);
    lines.push(`      "label": string,            // e.g. "Q1" or a short name for the item`);
    lines.push(`      "correct": boolean,         // true = correct (green check), false = wrong (red X)`);
    lines.push(`      "detail": string,           // one short line: the student's answer and why it is right/wrong`);
    lines.push(`      "correct_answer": string    // the expected answer (empty string if not applicable)`);
    lines.push(`    }`);
    lines.push(`  ],`);
  }
  lines.push(`  "confidence": number            // 0-1, your confidence in this grading`);
  lines.push(`}`);
  return lines.filter(Boolean).join("\n");
}
