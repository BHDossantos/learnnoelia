import { createClient } from "@supabase/supabase-js";
import { getStripe } from "./stripe";
import { classifyTutorReceipt, type TutorBinding } from "./tutor-receipt";

export function tutorAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Tutoring reconciliation is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function reconcileTutorSettlement(db: ReturnType<typeof tutorAdmin>, session: TutorBinding) {
  let outcome: { state: string; amount: number } = { state: "review_required", amount: 0 };
  if (session.stripe_payment_intent) {
    // Read-only: never capture/cancel an uncertain legacy authorization.
    const receipt = await getStripe().paymentIntents.retrieve(session.stripe_payment_intent);
    outcome = classifyTutorReceipt(session, receipt);
  }
  const { data, error } = await db.rpc("finish_tutor_settlement", {
    p_session: session.id, p_state: outcome.state, p_amount: outcome.amount,
  });
  if (error || !data) throw new Error("Could not persist payment reconciliation");
  return data;
}
