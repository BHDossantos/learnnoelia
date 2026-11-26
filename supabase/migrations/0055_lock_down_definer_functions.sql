-- 0055: lock down SECURITY DEFINER functions exposed through the REST API.
--
-- The Supabase security advisor flagged 29 SECURITY DEFINER functions as
-- callable by anonymous visitors (lint 0028). This migration:
--   1. removes API access to trigger-only functions (triggers do not need it);
--   2. makes the action RPCs signed-in only (every caller in the app already
--      requires a signed-in user);
--   3. adds the authorization checks that three of them were missing, plus a
--      sane range on award_xp so a user cannot grant themselves arbitrary XP;
--   4. pins search_path on search_content (lint 0011).
--
-- Deliberately left callable by anon:
--   * verify_credential  - the public /verify/[code] page and badge route.
--   * take_rate_limit    - the sign-in limiter runs before the user is signed in.
--   * RLS helper functions (is_org_member, is_org_admin, is_classroom_member,
--     is_classroom_teacher, is_guardian_of, is_guardian_of_classroom_member,
--     teaches_student, org_of_classroom, classroom_of_meeting,
--     can_read_assessment, is_assessment_teacher, owns_open_attempt).
--     Policies for role "public" call them, so every role evaluating those
--     policies needs EXECUTE. They only answer questions about auth.uid().

-- 1. Trigger-only functions --------------------------------------------------
revoke execute on function public.handle_new_user()               from public, anon, authenticated;
revoke execute on function public.notify_attendance_alert()       from public, anon, authenticated;
revoke execute on function public.notify_classroom_announcement() from public, anon, authenticated;
revoke execute on function public.notify_grade_returned()         from public, anon, authenticated;
revoke execute on function public.notify_paper_graded()           from public, anon, authenticated;
-- Triggers fire without an EXECUTE check, but keep the auth service explicit.
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- 3. Missing authorization checks -------------------------------------------
create or replace function public.award_xp(p_amount integer, p_kind text)
returns table(xp bigint, streak_days integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_stats public.user_stats%rowtype;
  v_streak int;
  v_freezes int;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  -- App awards are 2..25 XP per event; anything outside 1..50 is abuse.
  if p_amount is null or p_amount < 1 or p_amount > 50 then
    raise exception 'invalid xp amount';
  end if;

  insert into public.xp_events (user_id, amount, kind)
    values (v_user, p_amount, p_kind);

  select * into v_stats from public.user_stats s
    where s.user_id = v_user for update;

  if not found then
    insert into public.user_stats (user_id, xp, streak_days, longest_streak, last_activity_date, streak_freezes)
    values (v_user, p_amount, 1, 1, v_today, 2);
  else
    if v_stats.last_activity_date = v_today then
      v_streak := v_stats.streak_days;
      v_freezes := v_stats.streak_freezes;
    elsif v_stats.last_activity_date = v_today - 1 then
      v_streak := v_stats.streak_days + 1;
      v_freezes := v_stats.streak_freezes;
    elsif v_stats.last_activity_date = v_today - 2
      and v_stats.streak_freezes > 0 then
      v_streak := v_stats.streak_days + 1;
      v_freezes := v_stats.streak_freezes - 1;
    else
      v_streak := 1;
      v_freezes := v_stats.streak_freezes;
    end if;

    if v_stats.last_activity_date is distinct from v_today
      and v_streak % 7 = 0 then
      v_freezes := least(v_freezes + 1, 5);
    end if;

    update public.user_stats s set
      xp = s.xp + p_amount,
      streak_days = v_streak,
      longest_streak = greatest(s.longest_streak, v_streak),
      last_activity_date = v_today,
      streak_freezes = v_freezes,
      updated_at = now()
    where s.user_id = v_user;
  end if;

  return query
    select s.xp, s.streak_days from public.user_stats s where s.user_id = v_user;
end;
$function$;

-- Only an org admin of the classroom's school, or the course's teacher, may
-- fan a course out to the classroom, and only for a course already assigned
-- to that classroom (mirrors the "classroom_courses manage" policy).
create or replace function public.sync_classroom_course_enrollments(p_classroom uuid, p_course uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_added int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not (
    public.is_org_admin(public.org_of_classroom(p_classroom))
    or auth.uid() = (select c.teacher_id from public.courses c where c.id = p_course)
  ) then
    raise exception 'not allowed';
  end if;
  if not exists (
    select 1 from public.classroom_courses cc
    where cc.classroom_id = p_classroom and cc.course_id = p_course
  ) then
    raise exception 'course is not assigned to this classroom';
  end if;

  with picked as (
    select cm.user_id
    from public.classroom_members cm
    where cm.classroom_id = p_classroom and cm.role = 'student'
  ), ins as (
    insert into public.enrollments (user_id, course_id, role)
    select user_id, p_course, 'student' from picked
    on conflict (user_id, course_id) do nothing
    returning 1
  )
  select count(*) into v_added from ins;
  return v_added;
end;
$function$;

-- Only an org admin of the classroom's school may enroll a member, and only a
-- user who is already a student of that classroom (mirrors the
-- "classroom members manage" policy).
create or replace function public.sync_classroom_member_enrollments(p_classroom uuid, p_user uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_added int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_org_admin(public.org_of_classroom(p_classroom)) then
    raise exception 'not allowed';
  end if;
  if not exists (
    select 1 from public.classroom_members cm
    where cm.classroom_id = p_classroom and cm.user_id = p_user and cm.role = 'student'
  ) then
    raise exception 'user is not a student in this classroom';
  end if;

  with ins as (
    insert into public.enrollments (user_id, course_id, role)
    select p_user, cc.course_id, 'student'
    from public.classroom_courses cc
    where cc.classroom_id = p_classroom
    on conflict (user_id, course_id) do nothing
    returning 1
  )
  select count(*) into v_added from ins;
  return v_added;
end;
$function$;

-- Only the assignment's teacher can see how similar a submission is to its
-- classmates' (the /api/integrity route already checks this in app code).
create or replace function public.max_submission_similarity(p_submission_id uuid)
returns table(similar_submission_id uuid, similarity real)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s2.id, similarity(s1.text, s2.text) as sim
  from public.submissions s1
  join public.assignments a on a.id = s1.assignment_id
  join public.submissions s2
    on s2.assignment_id = s1.assignment_id
   and s2.id <> s1.id
   and s2.text is not null
  where s1.id = p_submission_id
    and s1.text is not null
    and a.teacher_id = auth.uid()
  order by sim desc
  limit 1;
$function$;

-- 2. Signed-in-only RPCs -----------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.award_xp(integer, text)',
    'public.bump_question_stat(uuid, integer, text, boolean)',
    'public.create_organization(text, text, text)',
    'public.issue_credential(uuid)',
    'public.join_organization(text)',
    'public.link_guardian_by_code(text)',
    'public.get_weekly_leaderboard(integer)',
    'public.max_submission_similarity(uuid)',
    'public.sync_classroom_course_enrollments(uuid, uuid)',
    'public.sync_classroom_member_enrollments(uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- 4. search_path -------------------------------------------------------------
alter function public.search_content(text, integer) set search_path = public, pg_catalog;
