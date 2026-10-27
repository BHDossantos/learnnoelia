import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { ClassroomRoster } from "./ClassroomRoster";
import { ClassroomCourses } from "./ClassroomCourses";
import { ClassroomSchedule } from "./ClassroomSchedule";
import { Announcements } from "./Announcements";

export const dynamic = "force-dynamic";

export default async function ClassroomPage(
  props: {
    params: Promise<{ orgId: string; classroomId: string }>;
  }
) {
  const params = await props.params;
  const user = await requireUser();
  const supabase = await supabaseServer();

  const { data: classroom } = await supabase
    .from("classrooms")
    .select("id,name,grade_level,org_id")
    .eq("id", params.classroomId)
    .maybeSingle();
  if (!classroom || classroom.org_id !== params.orgId) notFound();

  const [
    { data: orgMembers },
    { data: classMembers },
    { data: myOrgMembership },
    { data: assignedCourses },
    { data: catalogCourses },
    { data: meetings },
    { data: announcements },
  ] = await Promise.all([
    supabase
      .from("org_members")
      .select("user_id,profile:profiles(display_name)")
      .eq("org_id", params.orgId),
    supabase
      .from("classroom_members")
      .select("user_id,role,profile:profiles(display_name)")
      .eq("classroom_id", params.classroomId),
    supabase
      .from("org_members")
      .select("role")
      .eq("org_id", params.orgId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("classroom_courses")
      .select(`
        course:courses(
          id,title,subject,kind,
          assignments(id)
        )
      `)
      .eq("classroom_id", params.classroomId),
    // Assignable = the whole published catalog (platform content) PLUS the
    // teacher's own courses. Teachers pick from this by subject; they don't have
    // to build a course from scratch.
    supabase
      .from("courses")
      .select("id,title,kind,school,subject")
      .eq("published", true)
      .or(`teacher_id.is.null,teacher_id.eq.${user.id}`)
      .order("school")
      .order("position"),
    supabase
      .from("class_meetings")
      .select("id,title,location,scheduled_at,duration_minutes,attendance(user_id)")
      .eq("classroom_id", params.classroomId)
      .order("scheduled_at", { ascending: true })
      .limit(20),
    supabase
      .from("announcements")
      .select("id,body,pinned,created_at,poster:profiles!announcements_posted_by_fkey(display_name)")
      .eq("classroom_id", params.classroomId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const isOrgAdmin =
    myOrgMembership?.role === "owner" || myOrgMembership?.role === "admin";
  const isClassroomTeacher = (classMembers ?? []).some(
    (m: any) => m.user_id === user.id && m.role === "teacher",
  );
  const canManage = isOrgAdmin || isClassroomTeacher;

  const inClassroom = (classMembers ?? []).map((m: any) => ({
    user_id: m.user_id,
    role: m.role,
    name: m.profile?.display_name ?? m.user_id.slice(0, 8),
  }));
  const inSet = new Set(inClassroom.map((m) => m.user_id));
  const available = (orgMembers ?? [])
    .filter((m: any) => !inSet.has(m.user_id))
    .map((m: any) => ({
      user_id: m.user_id,
      name: m.profile?.display_name ?? m.user_id.slice(0, 8),
    }));

  const assigned = (assignedCourses ?? [])
    .map((row: any) => row.course)
    .filter(Boolean)
    .map((c: any) => ({
      id: c.id,
      title: c.title,
      subject: c.subject,
      kind: c.kind,
      assignmentCount: (c.assignments ?? []).length,
    }));
  const assignedIds = new Set(assigned.map((c) => c.id));
  const assignable = (catalogCourses ?? [])
    .filter((c: any) => !assignedIds.has(c.id))
    .map((c: any) => ({
      id: c.id,
      title: c.title,
      school: (c.school as string) ?? c.kind ?? "other",
      subject: c.subject as string | null,
    }));

  const studentCount = inClassroom.filter((p) => p.role === "student").length;
  const meetingRows = (meetings ?? []).map((m: any) => ({
    id: m.id,
    title: m.title,
    location: m.location,
    scheduled_at: m.scheduled_at,
    duration_minutes: m.duration_minutes,
    attendance_taken: (m.attendance ?? []).length,
    attendance_total: studentCount,
  }));

  // Recent assignments across all assigned courses, for a quick at-a-glance view.
  const assignedCourseIds = assigned.map((c) => c.id);
  const { data: recentAssignments } =
    assignedCourseIds.length === 0
      ? { data: [] as any[] }
      : await supabase
          .from("assignments")
          .select("id,title,kind,due_at,course_id")
          .in("course_id", assignedCourseIds)
          .eq("published", true)
          .order("due_at", { ascending: true, nullsFirst: false })
          .limit(10);

  // Teacher-only class mastery overview (spec §14). Reads students' skill_states
  // and misconceptions — enabled by migration 0031's teacher-read RLS. Best-effort.
  let masteryRows: { userId: string; name: string; mastered: number; developing: number; review: number }[] = [];
  let commonMisconceptions: { tag: string; count: number }[] = [];
  if (canManage && studentCount > 0) {
    const studentIds = inClassroom.filter((p) => p.role === "student").map((p) => p.user_id);
    const nameById = new Map(inClassroom.map((p) => [p.user_id, p.name]));
    try {
      const [{ data: states }, { data: misc }] = await Promise.all([
        supabase.from("skill_states").select("user_id,status").in("user_id", studentIds),
        supabase.from("misconceptions").select("user_id,tag").eq("status", "open").in("user_id", studentIds),
      ]);
      const agg = new Map<string, { mastered: number; developing: number; review: number }>();
      for (const id of studentIds) agg.set(id, { mastered: 0, developing: 0, review: 0 });
      for (const s of states ?? []) {
        const a = agg.get(s.user_id as string);
        if (!a) continue;
        if (s.status === "mastered") a.mastered++;
        else if (["proficient", "developing", "fragile"].includes(s.status as string)) a.developing++;
        else if (["needs_remediation", "decaying"].includes(s.status as string)) a.review++;
      }
      masteryRows = studentIds
        .map((id) => ({ userId: id, name: nameById.get(id) ?? id.slice(0, 8), ...agg.get(id)! }))
        .sort((a, b) => b.review - a.review || b.mastered - a.mastered);
      const tagCount = new Map<string, number>();
      for (const m of misc ?? []) tagCount.set(m.tag as string, (tagCount.get(m.tag as string) ?? 0) + 1);
      commonMisconceptions = [...tagCount.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);
    } catch {
      // migration 0031 not applied yet — panel stays hidden.
    }
  }
  const anyMasteryData = masteryRows.some((r) => r.mastered + r.developing + r.review > 0);

  return (
    <div className="space-y-5">
      <Link href={`/school/${params.orgId}`} className="text-sm text-brand-500">
        ← Organization
      </Link>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{classroom.name}</h1>
          {classroom.grade_level && (
            <p className="text-sm text-ink-500">{classroom.grade_level}</p>
          )}
        </div>
        {canManage && (
          <Link href={`/teach/classrooms/${classroom.id}/gradebook`} className="btn-primary shrink-0 text-sm">
            📊 Gradebook
          </Link>
        )}
      </header>

      <ClassroomCourses
        orgId={params.orgId}
        classroomId={classroom.id}
        canManage={canManage}
        assigned={assigned}
        assignable={assignable}
      />

      <ClassroomSchedule
        orgId={params.orgId}
        classroomId={classroom.id}
        canManage={canManage}
        meetings={meetingRows}
      />

      <Announcements
        orgId={params.orgId}
        classroomId={classroom.id}
        canManage={canManage}
        items={(announcements ?? []).map((a: any) => ({
          id: a.id,
          body: a.body,
          pinned: a.pinned,
          created_at: a.created_at,
          posted_by_name: a.poster?.display_name ?? null,
        }))}
      />

      {(recentAssignments ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Upcoming assignments
          </h2>
          <ul className="space-y-2">
            {(recentAssignments ?? []).map((a) => (
              <li key={a.id}>
                <Link href={`/teach/assignments/${a.id}`} className="card flex items-center justify-between">
                  <div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-xs text-ink-500 capitalize">
                      {a.kind}
                      {a.due_at ? ` · due ${new Date(a.due_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <span className="text-ink-500">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canManage && anyMasteryData && (
        <section className="space-y-2" data-testid="class-mastery">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Class mastery
          </h2>
          {masteryRows.some((r) => r.review > 0) && (
            <div className="card border-red-200 bg-red-50/60 dark:bg-red-500/10">
              <p className="text-xs font-semibold text-red-700">Needs attention</p>
              <p className="mt-0.5 text-xs text-red-700/80">
                {masteryRows
                  .filter((r) => r.review > 0)
                  .map((r) => `${r.name} (${r.review})`)
                  .join(" · ")}
              </p>
            </div>
          )}
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 text-left text-[11px] uppercase tracking-wider text-ink-500 dark:border-white/10">
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2 text-center">🟢 Mastered</th>
                  <th className="px-3 py-2 text-center">🟡 Developing</th>
                  <th className="px-3 py-2 text-center">🔴 To review</th>
                </tr>
              </thead>
              <tbody>
                {masteryRows.map((r) => (
                  <tr key={r.userId} className="border-b border-black/5 last:border-0 dark:border-white/10">
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-center">{r.mastered}</td>
                    <td className="px-3 py-2 text-center">{r.developing}</td>
                    <td className={"px-3 py-2 text-center " + (r.review > 0 ? "font-semibold text-red-600" : "text-ink-400")}>
                      {r.review}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {commonMisconceptions.length > 0 && (
            <div className="card">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                Common misconceptions
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {commonMisconceptions.map((m) => (
                  <span key={m.tag} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-800 dark:bg-amber-500/15">
                    {m.tag} <span className="font-semibold">×{m.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <ClassroomRoster
        orgId={params.orgId}
        classroomId={classroom.id}
        isAdmin={canManage}
        inClassroom={inClassroom}
        available={available}
      />
    </div>
  );
}
