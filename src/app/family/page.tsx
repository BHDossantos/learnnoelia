import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { FamilyClient } from "./FamilyClient";

export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const user = await requireUser();
  const supabase = await supabaseServer();

  const [{ data: profile }, { data: links }] = await Promise.all([
    supabase.from("profiles").select("guardian_invite_code, role").eq("id", user.id).single(),
    supabase
      .from("guardians")
      .select("student_id, student:profiles!guardians_student_id_fkey(id,display_name)")
      .eq("guardian_id", user.id),
  ]);

  const linkedStudents = (links ?? []).map((l: any) => ({
    id: l.student_id,
    name: l.student?.display_name ?? l.student_id.slice(0, 8),
  }));

  return (
    <FamilyClient
      initialCode={profile?.guardian_invite_code ?? null}
      linkedStudents={linkedStudents}
      role={(profile?.role as string) ?? null}
    />
  );
}
