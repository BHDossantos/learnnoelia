import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Body = z.object({ sessionId: z.string().guid() });

// Called from the client every ~30s while the call is live.
// Increments minutes_billed based on elapsed time and clamps to max budget.
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
    .select("id,started_at,status,max_budget_cents,tutor_id,student_id")
    .eq("id", parsed.data.sessionId)
    .single();
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (s.student_id !== user.id && s.tutor_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (s.status !== "live" || !s.started_at) {
    return NextResponse.json({ minutes: 0, status: s.status });
  }

  const { data: tutor } = await supabase
    .from("tutors").select("rate_cents_per_minute").eq("id", s.tutor_id).single();
  const rate = tutor?.rate_cents_per_minute ?? 0;

  const elapsedMs = Date.now() - new Date(s.started_at).getTime();
  const minutes = Math.ceil(elapsedMs / 60_000);
  const cents = minutes * rate;
  const overBudget = s.max_budget_cents != null && cents >= s.max_budget_cents;

  await supabase
    .from("tutor_sessions")
    .update({
      minutes_billed: minutes,
      cents_charged: Math.min(cents, s.max_budget_cents ?? cents),
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq("id", s.id);

  return NextResponse.json({ minutes, cents, overBudget });
}
