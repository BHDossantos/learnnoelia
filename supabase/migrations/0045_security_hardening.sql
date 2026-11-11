-- Security hardening (pre-launch audit). Closes RLS authorization holes that
-- were exploitable directly through the REST API, bypassing app logic:
--   1. Anyone could link themselves as a guardian to ANY student.
--   2. Anyone could write a teacher_review for a submission they don't teach.
--   3. Students/guardians could read grades on UNPUBLISHED (draft) grade items.
--   4. Anyone could forge their own credentials (fake certificates).
-- Idempotent.

-- ============================================================
-- 1) Guardians: linking must go through a code-validated function.
-- ============================================================
-- The old "guardian own links" (FOR ALL) let any authenticated user INSERT a
-- row with guardian_id = themselves and student_id = anyone. Replace with
-- read/delete-own only; inserts happen exclusively via link_guardian_by_code,
-- which checks the student's invite code.
drop policy if exists "guardian own links" on public.guardians;
drop policy if exists "guardian reads own links" on public.guardians;
drop policy if exists "guardian removes own links" on public.guardians;
create policy "guardian reads own links" on public.guardians
  for select using (auth.uid() = guardian_id);
create policy "guardian removes own links" on public.guardians
  for delete using (auth.uid() = guardian_id);

create or replace function public.link_guardian_by_code(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_student uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into v_student from profiles
    where guardian_invite_code = upper(regexp_replace(coalesce(p_code,''), '\s', '', 'g'));
  if v_student is null then raise exception 'No student found for that code'; end if;
  if v_student = auth.uid() then raise exception 'That is your own code'; end if;
  insert into guardians (guardian_id, student_id)
    values (auth.uid(), v_student)
    on conflict (guardian_id, student_id) do nothing;
  return v_student;
end; $$;
revoke all on function public.link_guardian_by_code(text) from public;
grant execute on function public.link_guardian_by_code(text) to authenticated;

-- ============================================================
-- 2) Teacher reviews: only the assignment's own teacher may read/write.
-- ============================================================
-- The old "teacher_reviews teacher rw" only checked teacher_id = auth.uid(),
-- so anyone could file a review (grade) on any submission as "themselves".
-- Require that the caller actually teaches the submission's assignment.
drop policy if exists "teacher_reviews teacher rw" on public.teacher_reviews;
drop policy if exists "teacher_reviews teacher manage" on public.teacher_reviews;
create policy "teacher_reviews teacher manage" on public.teacher_reviews
  for all
  using (
    auth.uid() = teacher_id
    and auth.uid() = (
      select a.teacher_id from public.assignments a
      join public.submissions s on s.assignment_id = a.id
      where s.id = teacher_reviews.submission_id
    )
  )
  with check (
    auth.uid() = teacher_id
    and auth.uid() = (
      select a.teacher_id from public.assignments a
      join public.submissions s on s.assignment_id = a.id
      where s.id = teacher_reviews.submission_id
    )
  );

-- ============================================================
-- 3) Grade entries: students/guardians only see PUBLISHED grade items.
-- ============================================================
drop policy if exists "gb_entries student read" on public.grade_entries;
create policy "gb_entries student read" on public.grade_entries for select
  using (
    (auth.uid() = student_id or public.is_guardian_of(student_id))
    and exists (
      select 1 from public.grade_items gi
      where gi.id = grade_entries.grade_item_id and gi.published
    )
  );

-- ============================================================
-- 4) Credentials: issued only by a completion-validated function.
-- ============================================================
-- The old "own credentials" (FOR ALL) let a user INSERT any credential for
-- themselves — a forged certificate. Users may now only READ their own;
-- issuance goes through issue_credential, which verifies every lesson is done.
drop policy if exists "own credentials" on public.credentials;
drop policy if exists "read own credentials" on public.credentials;
create policy "read own credentials" on public.credentials
  for select using (auth.uid() = user_id);

create or replace function public.issue_credential(p_course_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_total int;
  v_done int;
  v_code text;
  v_name text;
  v_title text;
  v_cefr text;
  v_mastery int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select count(*) into v_total from lessons where course_id = p_course_id;
  if v_total = 0 then raise exception 'no such course'; end if;
  select count(*) into v_done
    from lesson_progress lp join lessons l on l.id = lp.lesson_id
    where l.course_id = p_course_id and lp.user_id = v_uid and lp.completed_at is not null;
  if v_done < v_total then raise exception 'course not complete'; end if;

  select title, cefr_level into v_title, v_cefr from courses where id = p_course_id;
  select display_name into v_name from profiles where id = v_uid;
  v_code := upper('NOE-' || substr(v_uid::text, 1, 8) || '-' || substr(p_course_id::text, 1, 8));
  select round(100.0 * count(*) filter (where status = 'mastered') / nullif(v_total, 0))::int
    into v_mastery
    from skill_states
    where user_id = v_uid and skill_kind = 'lesson'
      and skill_id in (select id from lessons where course_id = p_course_id);

  insert into credentials (code, user_id, course_id, learner_name, course_title, cefr_level, skills_verified, mastery_pct)
    values (v_code, v_uid, p_course_id, coalesce(v_name, 'Learner'), v_title, v_cefr, array[v_title]::text[], v_mastery)
    on conflict (user_id, course_id)
    do update set learner_name = excluded.learner_name, mastery_pct = excluded.mastery_pct;
  return v_code;
end; $$;
revoke all on function public.issue_credential(uuid) from public;
grant execute on function public.issue_credential(uuid) to authenticated;
