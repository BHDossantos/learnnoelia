export type TutorReceipt = {
  id: string; status: string; amount_received: number; currency: string;
  metadata: Record<string, string>;
};
export type TutorBinding = {
  id: string; student_id: string; tutor_id: string; max_budget_cents: number | null;
  stripe_payment_intent: string | null;
};
export function classifyTutorReceipt(session: TutorBinding, receipt: TutorReceipt) {
  const review = { state: "review_required", amount: 0 } as const;
  // Historical intents only identify tutor/student. That does not establish
  // which session owns the receipt; require exact binding before accounting.
  if (receipt.id !== session.stripe_payment_intent ||
      receipt.metadata.session_id !== session.id ||
      receipt.metadata.student_id !== session.student_id ||
      receipt.metadata.tutor_id !== session.tutor_id || receipt.currency !== "usd") return review;
  if (receipt.status === "canceled") return { state: "cancelled", amount: 0 } as const;
  if (receipt.status !== "succeeded" || !Number.isSafeInteger(receipt.amount_received) ||
      receipt.amount_received <= 0 || session.max_budget_cents == null ||
      receipt.amount_received > session.max_budget_cents) return review;
  return { state: "captured", amount: receipt.amount_received } as const;
}
