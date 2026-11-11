import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { livekitRoomService } from "@/lib/livekit";
import { tutorAdmin, reconcileTutorSettlement } from "@/lib/tutor-settlement";

export const runtime = "nodejs";
const Body = z.object({ sessionId: z.string().guid() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  const userDb = await supabaseServer();
  const { data: { user } } = await userDb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: s, error: readError } = await userDb.from("tutor_sessions").select("*").eq("id", parsed.data.sessionId).single();
  if (readError || !s || (s.student_id !== user.id && s.tutor_id !== user.id)) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  try {
    const db = tutorAdmin();
    const { data: frozen, error } = await db.rpc("begin_tutor_settlement", { p_session: s.id, p_actor: user.id });
    if (error || !frozen) throw new Error("Could not end session");
    // Frozen end time is durable before provider work. Payment uncertainty
    // cannot keep the billing clock running or be reported as captured.
    let roomClosed = !s.livekit_room;
    if (s.livekit_room) {
      try { await livekitRoomService().deleteRoom(s.livekit_room); roomClosed = true; } catch { /* retryable */ }
    }
    try {
      const result = await reconcileTutorSettlement(db, { ...s, stripe_payment_intent: frozen.stripe_payment_intent });
      return NextResponse.json({ ended: true, paymentStatus: result.state, cents: ["captured", "cancelled"].includes(result.state) ? result.amount_cents : null, roomClosed });
    } catch {
      return NextResponse.json({ ended: true, paymentStatus: "pending", cents: null, roomClosed }, { status: 202 });
    }
  } catch {
    return NextResponse.json({ error: "Could not save the end request. Please retry.", ended: false }, { status: 503 });
  }
}
