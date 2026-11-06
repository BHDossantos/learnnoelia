import { z } from "zod";

const VocabItemInput = z.object({
  term: z.string().min(1).max(160),
  translation: z.string().min(1).max(200),
  ipa: z.string().max(80).optional(),
  example: z.string().max(400).optional(),
});

const VocabLesson = z.object({
  courseId: z.string().guid(),
  kind: z.literal("vocab"),
  title: z.string().min(2).max(160),
  items: z.array(VocabItemInput).min(1).max(60),
  notes: z.string().max(4000).optional(),
  estimatedMinutes: z.coerce.number().int().min(1).max(180).default(8),
});

const RoleplayLesson = z.object({
  courseId: z.string().guid(),
  kind: z.literal("roleplay"),
  title: z.string().min(2).max(160),
  scenario: z.string().min(5).max(1200),
  persona: z.string().max(400).optional(),
  goal: z.string().max(400).optional(),
  notes: z.string().max(4000).optional(),
  estimatedMinutes: z.coerce.number().int().min(1).max(180).default(10),
});

const ContentLesson = z.object({
  courseId: z.string().guid(),
  kind: z.enum(["reading", "grammar", "listening", "writing"]),
  title: z.string().min(2).max(160),
  content: z.string().min(1).max(12000),
  keyTermsRaw: z.string().max(4000).optional(),
  notes: z.string().max(4000).optional(),
  estimatedMinutes: z.coerce.number().int().min(1).max(180).default(10),
});

const QuizQuestion = z.object({
  prompt: z.string().min(3).max(400),
  options: z.array(z.string().min(1).max(200)).min(2).max(6),
  answer: z.number().int().min(0),
  explanation: z.string().max(400).optional(),
});

const QuizLesson = z.object({
  courseId: z.string().guid(),
  kind: z.literal("quiz"),
  title: z.string().min(2).max(160),
  questions: z.array(QuizQuestion).min(1).max(30),
  notes: z.string().max(4000).optional(),
  estimatedMinutes: z.coerce.number().int().min(1).max(180).default(5),
});

export const LessonInput = z.discriminatedUnion("kind", [VocabLesson, RoleplayLesson, ContentLesson, QuizLesson]);


const StoredQuizQuestion = QuizQuestion.passthrough().refine(q => q.answer < q.options.length, "answer index out of range");
const bodies: Record<string, z.ZodType> = {
  vocab: z.object({ items: z.array(VocabItemInput.passthrough()).min(1).max(60) }).passthrough(),
  quiz: z.object({ questions: z.array(StoredQuizQuestion).min(1).max(30) }).passthrough(),
  roleplay: z.object({ scenario: z.string().min(5).max(1200), persona: z.string().max(400).optional(), goal: z.string().max(400).optional() }).passthrough(),
  code: z.object({
    language: z.enum(["javascript", "js", "python", "py", "sql"]), prompt: z.string().min(1).max(12000),
    starter: z.string().max(20000).optional(), solution: z.string().max(20000).optional(),
    instructions: z.string().max(12000).optional(), schema: z.string().max(20000).optional(),
    tests: z.array(z.object({ label: z.string(), expr: z.string() }).passthrough()).max(100).optional(),
  }).passthrough(),
};
const content = z.object({
  content: z.string().min(1).max(12000).optional(),
  sections: z.array(z.object({ heading: z.string().optional(), text: z.string().min(1) }).passthrough()).min(1).max(100).optional(),
  key_terms: z.array(z.object({ term: z.string(), definition: z.string() })).max(100).optional(),
}).passthrough().refine(v => Boolean(v.content || v.sections?.length), "Lesson needs content or sections");
for (const kind of ["reading", "grammar", "listening", "writing"]) bodies[kind] = content;

export function validateLessonBody(kind: string, body: unknown): unknown {
  const schema = bodies[kind];
  if (!schema) throw new Error("This lesson kind cannot be edited safely yet");
  return schema.parse(body);
}
