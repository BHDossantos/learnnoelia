"use server";
import { supabaseServer } from "@/lib/supabase/server";

// Award XP for finishing a Match round (best-effort; feeds the same streak/XP
// system as lessons and reviews). Capped per round so it can't be farmed.
export async function awardMatchXp(): Promise<{ xp: number } | null> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  try {
    await supabase.rpc("award_xp", { p_amount: 20, p_kind: "match_game" });
    return { xp: 20 };
  } catch {
    return null;
  }
}
