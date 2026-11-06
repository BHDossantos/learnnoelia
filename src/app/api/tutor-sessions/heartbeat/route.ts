import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { tutorAdmin } from "@/lib/tutor-settlement";
export const runtime = "nodejs";
const Body = z.object({ sessionId: z.string().guid() });
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: s } = await db.from("tutor_sessions").select("*").eq("id", parsed.data.sessionId).single();
  if (!s || (s.student_id !== user.id && s.tutor_id !== user.id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (s.ended_at || s.status !== "live") return NextResponse.json({ ended: true, status: s.status });
  try {
    const { error } = await tutorAdmin().from("tutor_sessions").update({ last_heartbeat_at: new Date().toISOString() }).eq("id", s.id).is("ended_at", null);
    if (error) throw error;
    return NextResponse.json({ status: s.status, minutes: Math.max(0, Math.ceil((Date.now() - new Date(s.started_at).getTime()) / 60000)) });
  } catch { return NextResponse.json({ error: "Heartbeat unavailable" }, { status: 503 }); }
}
