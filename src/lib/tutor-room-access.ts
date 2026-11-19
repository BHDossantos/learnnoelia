import { getStripe } from './stripe';
import { hasTutorAuthorization, type TutorRoomSession } from './tutor-authorization';

export async function canJoinTutorRoom(session: TutorRoomSession) {
  // Do not retrieve legacy/unaccepted payments or mint tokens on provider failure.
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !session.stripe_payment_intent || session.status !== 'live' || !session.tutor_accepted_at) return false;
  const live = /^(sk|rk)_live_/.test(key);
  if (!live && !/^(sk|rk)_test_/.test(key)) return false;
  try {
    const payment = await getStripe().paymentIntents.retrieve(session.stripe_payment_intent);
    return hasTutorAuthorization(session, payment, live);
  } catch { return false; }
}
