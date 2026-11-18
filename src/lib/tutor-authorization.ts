/** Provider confirmation is checked server-side before issuing a room token. */
export type TutorRoomSession = {
  id: string; student_id: string; tutor_id: string; status: string;
  stripe_payment_intent: string | null; max_budget_cents: number | null;
  tutor_accepted_at?: string | null;
};
export type TutorAuthorization = {
  id: string; status: string; capture_method: string; currency: string;
  amount: number; amount_capturable: number; livemode: boolean;
  metadata: Record<string, string>;
};
export function hasTutorAuthorization(session: TutorRoomSession, payment: TutorAuthorization, live: boolean) {
  const budget = session.max_budget_cents;
  return session.status === 'live' && !!session.tutor_accepted_at &&
    Number.isFinite(Date.parse(session.tutor_accepted_at)) &&
    typeof budget === 'number' && Number.isSafeInteger(budget) && budget > 0 &&
    !!session.stripe_payment_intent && payment.id === session.stripe_payment_intent &&
    payment.status === 'requires_capture' && payment.capture_method === 'manual' &&
    payment.livemode === live && payment.currency === 'usd' &&
    payment.amount === budget && payment.amount_capturable === budget &&
    payment.metadata.session_id === session.id &&
    payment.metadata.student_id === session.student_id &&
    payment.metadata.tutor_id === session.tutor_id;
}
