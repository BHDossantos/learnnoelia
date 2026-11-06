import { z } from "zod";
export const AssessmentResponse = z.union([
  z.object({ index: z.number().int().min(0).max(1000) }).strict(),
  z.object({ indices: z.array(z.number().int().min(0).max(1000)).max(1000) }).strict(),
  z.object({ value: z.number() }).strict(),
  z.object({ text: z.string().max(20000) }).strict(),
]).nullable();
export const AssessmentAnswers = z.record(z.string().guid(), AssessmentResponse)
  .refine(answers => Object.keys(answers).length <= 500, "Too many answers");
