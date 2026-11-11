import { supabaseServer } from "@/lib/supabase/server";
import { mintLivekitToken } from "@/lib/livekit";
import { SessionRoom } from "./SessionRoom";

export const dynamic = "force-dynamic";

export default async function SessionPage(
  props: {
    params: Promise<{ tutorId: string; sessionId: string }>;
  }
) {
  const params = await props.params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <p>Sign in to join.</p>;

  const { data: s } = await supabase
    .from("tutor_sessions")
    .select("id,status,livekit_room,started_at,minutes_billed,cents_charged,max_budget_cents,tutor_id,student_id")
    .eq("id", params.sessionId)
    .single();
  if (!s) return <p>Session not found.</p>;
  if (s.student_id !== user.id && s.tutor_id !== user.id) {
    return <p>Forbidden.</p>;
  }

  const { data: tutor } = await supabase
    .from("tutors").select("display_name,rate_cents_per_minute").eq("id", s.tutor_id).single();

  let token: string | null = null;
  if (s.status === "live" && s.livekit_room && process.env.LIVEKIT_API_KEY) {
    token = await mintLivekitToken({
      identity: user.id,
      name: user.user_metadata?.display_name ?? "Participant",
      room: s.livekit_room,
    });
  }

  return (
    <SessionRoom
      sessionId={s.id}
      room={s.livekit_room}
      livekitUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL ?? null}
      token={token}
      ratePerMinute={tutor?.rate_cents_per_minute ?? 0}
      maxBudgetCents={s.max_budget_cents ?? 0}
      tutorName={tutor?.display_name ?? "Tutor"}
      initialStatus={s.status}
    />
  );
}
