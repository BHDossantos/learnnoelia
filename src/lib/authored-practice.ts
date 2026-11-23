export type AuthoredPracticeQuestion = {prompt: string; options: string[]; answer: number; explanation: string};
export function promptKey(prompt: string) { return prompt.trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }

// Use existing teacher-authored choices only. Never synthesize distractors or
// turn ambiguous/duplicate choices into a graded question.
export function authoredPractice(body: any): AuthoredPracticeQuestion[] {
  const questions: AuthoredPracticeQuestion[] = [];
  const seen = new Set<string>();
  for (const source of [body?.practice_questions, body?.questions]) {
    for (const q of Array.isArray(source) ? source : []) {
      if (!q || typeof q.prompt !== 'string' || !q.prompt.trim() || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8 || !q.options.every((o: unknown) => typeof o === 'string' && o.trim()) || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) continue;
      const options: string[] = q.options.map((o: string) => o.trim());
      if (new Set(options.map(promptKey)).size !== options.length) continue;
      const key = promptKey(q.prompt);
      if (seen.has(key)) continue;
      seen.add(key);
      questions.push({prompt:q.prompt.trim(),options,answer:q.answer,explanation:typeof q.explanation === 'string' && q.explanation.trim() ? q.explanation.trim() : options[q.answer]});
    }
  }
  return questions;
}
