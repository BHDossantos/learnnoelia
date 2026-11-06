import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { livekitRoomService } from "@/lib/livekit";

export const runtime = "nodejs";

const Body = z.object({ sessionId: z.string().guid() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: s } = await supabase
    .from("tutor_sessions")
    .select("*")
    .eq("id", parsed.data.sessionId)
    .single();
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (s.student_id !== user.id && s.tutor_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (s.status === "ended") {
    return NextResponse.json({ minutes: s.minutes_billed, cents: s.cents_charged });
  }

  const { data: tutor } = await supabase
    .from("tutors").select("rate_cents_per_minute").eq("id", s.tutor_id).single();
  const rate = tutor?.rate_cents_per_minute ?? 0;

  const elapsedMs = s.started_at ? Date.now() - new Date(s.started_at).getTime() : 0;
  const minutes = Math.max(1, Math.ceil(elapsedMs / 60_000));
  const cents = Math.min(minutes * rate, s.max_budget_cents ?? minutes * rate);

  // Capture only the amount actually used; Stripe refunds the rest.
  if (s.stripe_payment_intent && cents > 0) {
    try {
      await getStripe().paymentIntents.capture(s.stripe_payment_intent, { amount_to_capture: cents });
    } catch (e: any) {
      // If already captured or canceled, log and continue.
      console.error("stripe capture failed", e?.message);
    }
  } else if (s.stripe_payment_intent) {
    try { await getStripe().paymentIntents.cancel(s.stripe_payment_intent); } catch {}
  }

  if (s.livekit_room) {
    try { await livekitRoomService().deleteRoom(s.livekit_room); } catch {}
  }

  await supabase
    .from("tutor_sessions")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      minutes_billed: minutes,
      cents_charged: cents,
    })
    .eq("id", s.id);

  await supabase.from("payments").insert({
    user_id: s.student_id,
    session_id: s.id,
    stripe_payment_intent: s.stripe_payment_intent,
    amount_cents: cents,
    status: "captured",
  });

  return NextResponse.json({ minutes, cents });
}
