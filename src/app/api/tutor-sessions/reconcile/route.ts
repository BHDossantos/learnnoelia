import { NextResponse } from "next/server";
import { tutorAdmin, reconcileTutorSettlement } from "@/lib/tutor-settlement";
import { livekitRoomService } from "@/lib/livekit";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const db = tutorAdmin();
    const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: abandoned, error: staleError } = await db.from("tutor_sessions").select("id,student_id")
      .eq("status", "live").is("ended_at", null).lt("started_at", cutoff)
      .or(`last_heartbeat_at.lt.${cutoff},last_heartbeat_at.is.null`).order("started_at").limit(50);
    if (staleError) throw staleError;
    for (const session of abandoned ?? []) {
      const frozen = await db.rpc("begin_tutor_settlement", { p_session: session.id, p_actor: session.student_id });
      if (frozen.error) throw frozen.error;
    }
    // Oldest attempted first: failed rows rotate rather than starving later rows.
    const { data: rows, error } = await db.from("tutor_settlements").select("session_id,stripe_payment_intent")
      .in("state", ["pending", "review_required"]).order("updated_at").limit(50);
    if (error) throw error;
    let checked = 0, pending = 0;
    for (const row of rows ?? []) {
      const touched = await db.from("tutor_settlements").update({ updated_at: new Date().toISOString() }).eq("session_id", row.session_id);
      if (touched.error) throw touched.error;
      const { data: s, error: readError } = await db.from("tutor_sessions").select("*").eq("id", row.session_id).single();
      if (readError || !s) { pending++; continue; }
      if (s.livekit_room) {
        try { await livekitRoomService().deleteRoom(s.livekit_room); } catch { pending++; }
      }
      try { await reconcileTutorSettlement(db, { ...s, stripe_payment_intent: row.stripe_payment_intent }); checked++; }
      catch { pending++; }
    }
    return NextResponse.json({ checked, pending });
  } catch { return NextResponse.json({ error: "Reconciliation unavailable" }, { status: 503 }); }
}
