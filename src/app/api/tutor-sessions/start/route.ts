import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { livekitRoomService, mintLivekitToken } from "@/lib/livekit";

export const runtime = "nodejs";

const Body = z.object({
  tutorId: z.string().guid(),
  maxMinutes: z.number().int().min(5).max(120).default(30),
  shareLearnerSnapshot: z.boolean().default(true),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { tutorId, maxMinutes, shareLearnerSnapshot } = parsed.data;

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: tutor } = await supabase
    .from("tutors")
    .select("rate_cents_per_minute,is_online,display_name,stripe_account_id")
    .eq("id", tutorId)
    .single();
  if (!tutor) return NextResponse.json({ error: "tutor not found" }, { status: 404 });
  if (!tutor.is_online) return NextResponse.json({ error: "tutor offline" }, { status: 409 });

  const maxBudgetCents = tutor.rate_cents_per_minute * maxMinutes;

  let snapshot: unknown = null;
  if (shareLearnerSnapshot) {
    const [{ data: errors }, { data: profile }, { data: recent }] = await Promise.all([
      supabase.from("error_log").select("category,detail,created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("profiles").select("cefr_level,goals,native_language").eq("id", user.id).single(),
      supabase.from("srs_reviews").select("rating,reviewed_at,card_id")
        .order("reviewed_at", { ascending: false }).limit(15),
    ]);
    snapshot = { profile, recentErrors: errors ?? [], recentReviews: recent ?? [] };
  }

  // Reserve funds: PaymentIntent with manual capture for max budget.
  const intent = await getStripe().paymentIntents.create({
    amount: maxBudgetCents,
    currency: "usd",
    capture_method: "manual",
    metadata: { tutor_id: tutorId, student_id: user.id, max_minutes: String(maxMinutes) },
    transfer_data: tutor.stripe_account_id
      ? { destination: tutor.stripe_account_id }
      : undefined,
  });

  // Provision LiveKit room.
  const room = `lf-${crypto.randomUUID()}`;
  await livekitRoomService().createRoom({ name: room, emptyTimeout: 60 * 5, maxParticipants: 4 });
  const livekitToken = await mintLivekitToken({
    identity: user.id,
    name: user.user_metadata?.display_name ?? "Student",
    room,
  });

  const { data: session, error } = await supabase
    .from("tutor_sessions")
    .insert({
      student_id: user.id,
      tutor_id: tutorId,
      status: "live",
      started_at: new Date().toISOString(),
      max_budget_cents: maxBudgetCents,
      stripe_payment_intent: intent.id,
      livekit_room: room,
      shared_learner_snapshot: snapshot,
      last_heartbeat_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    sessionId: session.id,
    room,
    livekitUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL,
    livekitToken,
    paymentIntentClientSecret: intent.client_secret,
    maxBudgetCents,
    ratePerMinute: tutor.rate_cents_per_minute,
  });
}
