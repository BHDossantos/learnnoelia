import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { OrgDashboard } from "./OrgDashboard";

export const dynamic = "force-dynamic";

export default async function OrgPage(props: { params: Promise<{ orgId: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  const supabase = await supabaseServer();

  const { data: org } = await supabase
    .from("organizations")
    .select("id,name,type,country,invite_code")
    .eq("id", params.orgId)
    .maybeSingle();
  if (!org) notFound();

  const [{ data: members }, { data: classrooms }, { data: myMembership }] = await Promise.all([
    supabase
      .from("org_members")
      .select("user_id,role,profile:profiles(display_name)")
      .eq("org_id", params.orgId),
    supabase
      .from("classrooms")
      .select("id,name,grade_level,term,classroom_members(user_id)")
      .eq("org_id", params.orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("org_members")
      .select("role")
      .eq("org_id", params.orgId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const isAdmin = myMembership?.role === "owner" || myMembership?.role === "admin";

  const memberRows = (members ?? []).map((m: any) => ({
    user_id: m.user_id,
    role: m.role,
    name: m.profile?.display_name ?? m.user_id.slice(0, 8),
  }));

  const classroomRows = (classrooms ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    grade_level: c.grade_level,
    term: c.term ?? null,
    size: (c.classroom_members ?? []).length,
  }));

  return (
    <div className="space-y-5">
      <Link href="/school" className="text-sm text-brand-500">← School</Link>
      <header>
        <h1 className="text-2xl font-bold">{org.name}</h1>
        <p className="text-sm capitalize text-ink-500">
          {org.type.replace("_", " ")}{org.country ? ` · ${org.country}` : ""}
        </p>
      </header>

      {isAdmin && (
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Invite code
          </p>
          <p className="text-2xl font-bold tracking-[0.3em] text-brand-700">
            {org.invite_code}
          </p>
          <p className="text-xs text-ink-500">
            Share with teachers and students to let them join this organization.
          </p>
        </div>
      )}

      <OrgDashboard
        orgId={org.id}
        isAdmin={isAdmin}
        members={memberRows}
        classrooms={classroomRows}
      />
    </div>
  );
}
