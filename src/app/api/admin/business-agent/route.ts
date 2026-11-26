import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { BUSINESS_AGENT } from "@/lib/agent/charter";
import { SHARED_APPROVALS, runBusinessTask, type Evidence } from "@/lib/agent/core";
import { agentOffReason, isAgentAdmin, providerFromEnv } from "@/lib/agent/provider";
import { MODEL } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The LearnNoelia business agent (ported from Jennifer). Admins only: everyone
// else gets a 404. Off until BUSINESS_AGENT_ENABLED=true and ANTHROPIC_API_KEY
// are set on the server. It only proposes; the result is returned here and
// nothing is sent, posted, stored or changed.

async function admin() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user && isAgentAdmin(user.email) ? user : null;
}

export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ agent: BUSINESS_AGENT, sharedApprovals: SHARED_APPROVALS, off: agentOffReason() });
}

const Body = z.object({
  taskId: z.string().max(40),
  /** Optional notes from the admin, such as replies or leads to look at. Treated as untrusted. */
  notes: z.string().max(8000).optional(),
});

async function liveNumbers(): Promise<Evidence[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const d7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ count: users }, { count: newUsers }, { count: lessons }] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", d7),
    db.from("lesson_progress").select("lesson_id", { count: "exact", head: true }).gte("completed_at", d7),
  ]);
  return [{
    sourceId: "app:metrics",
    title: "LearnNoelia numbers (last 7 days)",
    trusted: true,
    text: `Learners in total: ${users ?? 0}. New signups in the last 7 days: ${newUsers ?? 0}. Lessons completed in the last 7 days: ${lessons ?? 0}.`,
  }];
}

export async function POST(req: Request) {
  const user = await admin();
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const off = agentOffReason();
  if (off) return NextResponse.json({ off }, { status: 503 });

  const { takeRateLimit } = await import("@/lib/rate-limit");
  if (!(await takeRateLimit(`business-agent:${user.id}`, 10, 3600))) {
    return NextResponse.json({ error: "Too many runs this hour. Try again later." }, { status: 429 });
  }

  const evidence = await liveNumbers();
  if (parsed.data.notes) evidence.push({ sourceId: "admin:notes", title: "Notes from the admin", text: parsed.data.notes });
  const result = await runBusinessTask({
    agent: BUSINESS_AGENT,
    taskId: parsed.data.taskId,
    evidence,
    model: providerFromEnv({ ...process.env, BUSINESS_AGENT_MODEL: process.env.BUSINESS_AGENT_MODEL || MODEL }),
  });
  return NextResponse.json(result);
}
