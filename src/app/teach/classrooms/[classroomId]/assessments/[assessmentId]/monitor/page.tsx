import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { MonitorClient } from "./MonitorClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live monitor" };

export default async function MonitorPage(
  props: { params: Promise<{ classroomId: string; assessmentId: string }> },
) {
  const { classroomId, assessmentId } = await props.params;
  await requireOnboardedUser();
  const supabase = await supabaseServer();

  const { data: isTeacher } = await supabase.rpc("is_classroom_teacher", { p_classroom: classroomId });
  if (!isTeacher) notFound();

  const { data: assessment } = await supabase
    .from("assessments").select("id,title,classroom_id").eq("id", assessmentId).maybeSingle();
  if (!assessment || assessment.classroom_id !== classroomId) notFound();

  return (
    <div className="space-y-4">
      <header>
        <Link href={`/teach/classrooms/${classroomId}/assessments/${assessmentId}/results`} className="text-sm text-brand-500">← Results</Link>
        <h1 className="mt-1 text-2xl font-bold">Live monitor — {assessment.title}</h1>
        <p className="text-sm text-ink-500">Who&apos;s taking it now, activity, and tab-switch flags. Updates every few seconds.</p>
      </header>
      <MonitorClient classroomId={classroomId} assessmentId={assessmentId} />
    </div>
  );
}
