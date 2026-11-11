"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

async function requireUserId() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return { supabase, userId: user.id };
}

const CreateMeetingInput = z.object({
  orgId: z.string().guid(),
  classroomId: z.string().guid(),
  scheduledAt: z.string().min(1), // datetime-local string
  durationMinutes: z.coerce.number().int().min(5).max(480).default(60),
  title: z.string().max(160).optional(),
  location: z.string().max(160).optional(),
});

export async function createMeeting(input: z.input<typeof CreateMeetingInput>) {
  const data = CreateMeetingInput.parse(input);
  const { supabase, userId } = await requireUserId();
  const { error } = await supabase.from("class_meetings").insert({
    classroom_id: data.classroomId,
    scheduled_at: new Date(data.scheduledAt).toISOString(),
    duration_minutes: data.durationMinutes,
    title: data.title || null,
    location: data.location || null,
    created_by: userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/school/${data.orgId}/classrooms/${data.classroomId}`);
}

const DeleteMeetingInput = z.object({
  orgId: z.string().guid(),
  classroomId: z.string().guid(),
  meetingId: z.string().guid(),
});

export async function deleteMeeting(input: z.input<typeof DeleteMeetingInput>) {
  const data = DeleteMeetingInput.parse(input);
  const { supabase } = await requireUserId();
  const { error } = await supabase.from("class_meetings").delete().eq("id", data.meetingId);
  if (error) throw new Error(error.message);
  revalidatePath(`/school/${data.orgId}/classrooms/${data.classroomId}`);
}

const MarkAttendanceInput = z.object({
  orgId: z.string().guid(),
  classroomId: z.string().guid(),
  meetingId: z.string().guid(),
  items: z
    .array(
      z.object({
        userId: z.string().guid(),
        status: z.enum(["present", "absent", "late", "excused"]),
        note: z.string().max(280).optional(),
      }),
    )
    .min(1)
    .max(200),
});

export async function markAttendance(input: z.input<typeof MarkAttendanceInput>) {
  const data = MarkAttendanceInput.parse(input);
  const { supabase, userId } = await requireUserId();
  const rows = data.items.map((i) => ({
    meeting_id: data.meetingId,
    user_id: i.userId,
    status: i.status,
    note: i.note ?? null,
    marked_by: userId,
    marked_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "meeting_id,user_id" });
  if (error) throw new Error(error.message);
  revalidatePath(
    `/school/${data.orgId}/classrooms/${data.classroomId}/meetings/${data.meetingId}`,
  );
}
