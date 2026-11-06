// Assessment engine domain model + deterministic grading. Pure and server-safe:
// grading runs on the server against answer keys the student never sees. Written
// questions return null here and are handed to the AI grader + teacher review.

export type QuestionKind = "mcq" | "multi" | "short" | "written" | "truefalse" | "numeric";

export type AssessmentQuestion = {
  id: string;
  assessment_id: string;
  position: number;
  kind: QuestionKind;
  prompt: string;
  options?: string[] | null;
  points: number;
};

// Server-only — never sent to a student's browser.
export type AnswerKey = {
  question_id: string;
  correct_index?: number | null;
  correct_indices?: number[] | null;
  correct_text?: string | null;
  correct_number?: number | null;
  number_tolerance?: number | null;
  rubric?: string | null;
};

export type ResponseValue =
  | { index: number }
  | { indices: number[] }
  | { text: string }
  | { value: number };

export type GradeResult = {
  points_awarded: number;
  is_correct: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

// Deterministically grade one response against its key. Returns null for kinds
// that need judgement (written) — those go to the AI grader + teacher review.
export function gradeResponse(
  question: Pick<AssessmentQuestion, "kind" | "points">,
  key: AnswerKey | null | undefined,
  response: ResponseValue | null | undefined,
): GradeResult | null {
  const max = question.points ?? 0;
  if (!key || response == null) {
    if (question.kind === "written") return null;
    return { points_awarded: 0, is_correct: false };
  }

  switch (question.kind) {
    case "mcq":
    case "truefalse": {
      // True/False is a 2-option MCQ: index 0 = True, 1 = False.
      const chosen = (response as any).index;
      const ok = typeof chosen === "number" && chosen === key.correct_index;
      return { points_awarded: ok ? max : 0, is_correct: ok };
    }
    case "numeric": {
      const given = (response as any).value;
      if (typeof given !== "number" || !Number.isFinite(given) || key.correct_number == null) {
        return { points_awarded: 0, is_correct: false };
      }
      const ok = Math.abs(given - key.correct_number) <= (key.number_tolerance ?? 0);
      return { points_awarded: ok ? max : 0, is_correct: ok };
    }
    case "multi": {
      const chosen: number[] = Array.isArray((response as any).indices) ? (response as any).indices : [];
      const correct = new Set(key.correct_indices ?? []);
      if (correct.size === 0) return { points_awarded: 0, is_correct: false };
      const chosenSet = new Set(chosen);
      let hits = 0;
      let wrong = 0;
      for (const c of chosenSet) (correct.has(c) ? hits++ : wrong++);
      // Partial credit: reward correct picks, penalize wrong ones, floor at 0.
      const fraction = Math.max(0, (hits - wrong) / correct.size);
      const exact = hits === correct.size && wrong === 0;
      return { points_awarded: round2(max * fraction), is_correct: exact };
    }
    case "short": {
      const given = typeof (response as any).text === "string" ? norm((response as any).text) : "";
      // Accept a pipe-separated list of acceptable answers in correct_text.
      const accepted = (key.correct_text ?? "").split("|").map(norm).filter(Boolean);
      const ok = given.length > 0 && accepted.includes(given);
      return { points_awarded: ok ? max : 0, is_correct: ok };
    }
    case "written":
      return null; // needs AI + teacher review
    default:
      return { points_awarded: 0, is_correct: false };
  }
}

// Sum deterministic results into an attempt score. Written questions that haven't
// been graded yet contribute 0 and are reported as pending so the UI can show
// "awaiting review" and the teacher can publish once they're done.
export function tallyAttempt(
  questions: Pick<AssessmentQuestion, "id" | "kind" | "points">[],
  graded: Map<string, GradeResult | null>,
): { score: number; maxScore: number; pendingWritten: number } {
  let score = 0;
  let maxScore = 0;
  let pendingWritten = 0;
  for (const q of questions) {
    maxScore += q.points ?? 0;
    const r = graded.get(q.id);
    if (r == null) {
      if (q.kind === "written") pendingWritten++;
      continue;
    }
    score += r.points_awarded;
  }
  return { score: round2(score), maxScore: round2(maxScore), pendingWritten };
}
