import { describe, it, expect } from "vitest";
import { gradeResponse, tallyAttempt, type AssessmentQuestion } from "./assessments";

describe("gradeResponse", () => {
  it("grades MCQ correct/incorrect", () => {
    const q = { kind: "mcq" as const, points: 2 };
    expect(gradeResponse(q, { question_id: "1", correct_index: 1 }, { index: 1 })).toEqual({ points_awarded: 2, is_correct: true });
    expect(gradeResponse(q, { question_id: "1", correct_index: 1 }, { index: 0 })).toEqual({ points_awarded: 0, is_correct: false });
  });

  it("gives partial credit on multi-select and penalizes wrong picks", () => {
    const q = { kind: "multi" as const, points: 4 };
    const key = { question_id: "1", correct_indices: [0, 2] };
    expect(gradeResponse(q, key, { indices: [0, 2] })).toEqual({ points_awarded: 4, is_correct: true });
    // one right, one wrong -> (1-1)/2 = 0
    expect(gradeResponse(q, key, { indices: [0, 1] })).toEqual({ points_awarded: 0, is_correct: false });
    // one of two right -> 0.5 * 4 = 2, not fully correct
    expect(gradeResponse(q, key, { indices: [0] })).toEqual({ points_awarded: 2, is_correct: false });
  });

  it("grades short answer case/space-insensitively with alternatives", () => {
    const q = { kind: "short" as const, points: 1 };
    const key = { question_id: "1", correct_text: "hola|buenos dias" };
    expect(gradeResponse(q, key, { text: "  Hola " })?.is_correct).toBe(true);
    expect(gradeResponse(q, key, { text: "Buenos Dias" })?.is_correct).toBe(true);
    expect(gradeResponse(q, key, { text: "adios" })?.is_correct).toBe(false);
  });

  it("returns null for written questions (needs AI + review)", () => {
    expect(gradeResponse({ kind: "written", points: 10 }, { question_id: "1", rubric: "..." }, { text: "an essay" })).toBeNull();
  });

  it("scores 0 for a missing response on auto-graded kinds", () => {
    expect(gradeResponse({ kind: "mcq", points: 2 }, { question_id: "1", correct_index: 0 }, null)).toEqual({ points_awarded: 0, is_correct: false });
  });
});

describe("tallyAttempt", () => {
  it("sums deterministic scores and flags pending written questions", () => {
    const questions: Pick<AssessmentQuestion, "id" | "kind" | "points">[] = [
      { id: "a", kind: "mcq", points: 2 },
      { id: "b", kind: "multi", points: 4 },
      { id: "c", kind: "written", points: 10 },
    ];
    const graded = new Map([
      ["a", { points_awarded: 2, is_correct: true }],
      ["b", { points_awarded: 2, is_correct: false }],
      ["c", null],
    ]);
    expect(tallyAttempt(questions, graded)).toEqual({ score: 4, maxScore: 16, pendingWritten: 1 });
  });
});
