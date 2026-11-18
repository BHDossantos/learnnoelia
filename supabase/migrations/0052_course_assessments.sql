-- Course-level (self-paced) assessments: real exams & quizzes attached to a
-- COURSE rather than a classroom. Catalog learners (Biology, Chemistry, …) have
-- no teacher, so these are auto-graded and self-published on submit. Reuses the
-- secure answer-key separation (students never read keys; grading is server-side)
-- and the mastery engine. Idempotent.

-- 1) Allow a course scope on assessments (exactly one of classroom / course).
alter table public.assessments alter column classroom_id drop not null;
alter table public.assessments add column if not exists course_id uuid references public.courses(id) on delete cascade;
alter table public.assessments add column if not exists kind text not null default 'exam' check (kind in ('quiz','exam'));
alter table public.assessments add column if not exists position int not null default 0;
alter table public.assessments drop constraint if exists assess_one_scope;
alter table public.assessments add constraint assess_one_scope
  check ((classroom_id is not null) <> (course_id is not null));
create index if not exists idx_assessments_course on public.assessments (course_id, kind, position) where course_id is not null;

-- 2) Read access: any signed-in learner may read a PUBLISHED course assessment's
--    questions (content only — keys remain unreadable).
create or replace function public.can_read_assessment(p_assessment uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from assessments a
    where a.id = p_assessment
      and (
        (a.classroom_id is not null and (public.is_classroom_teacher(a.classroom_id)
             or (a.status = 'published' and public.is_classroom_member(a.classroom_id))))
        or (a.course_id is not null and a.status = 'published' and auth.uid() is not null)
      )
  );
$$;
revoke all on function public.can_read_assessment(uuid) from public;
grant execute on function public.can_read_assessment(uuid) to authenticated;

-- 3) RLS: the student read policy now also exposes course-level published ones.
drop policy if exists "assess student read" on public.assessments;
create policy "assess student read" on public.assessments for select
  using (status = 'published' and (
    (classroom_id is not null and public.is_classroom_member(classroom_id))
    or (course_id is not null and auth.uid() is not null)
  ));

-- 4) Starting an attempt: allow any signed-in learner for a published course one.
create or replace function public.start_assessment_attempt(p_assessment uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.assessments; result uuid;
begin
 select * into a from public.assessments where id=p_assessment for update;
 if auth.uid() is null or not found or a.status<>'published'
    or not ( (a.classroom_id is not null and public.is_classroom_member(a.classroom_id))
             or a.course_id is not null )
 then raise exception 'Assessment unavailable'; end if;
 insert into public.assessment_attempts(assessment_id,student_id) values(a.id,auth.uid()) on conflict(assessment_id,student_id) do nothing;
 select id into result from public.assessment_attempts where assessment_id=a.id and student_id=auth.uid();
 return result;
end $$;
revoke all on function public.start_assessment_attempt(uuid) from public,anon;
grant execute on function public.start_assessment_attempt(uuid) to authenticated;

-- 5) Committing results: course-level assessments have no classroom gradebook, so
--    skip grade_items/grade_entries for them; still score the attempt, record
--    mastery evidence, and self-publish. Classroom behaviour is unchanged.
create or replace function public.commit_assessment_result(p_attempt uuid) returns void language plpgsql security definer set search_path='' as $$
declare at public.assessment_attempts; a public.assessments; gi uuid; total numeric; maximum numeric; item record; fraction real; inserted bigint;
begin
 select * into at from public.assessment_attempts where id=p_attempt for update;
 if at.published then return; end if;
 if at.status<>'submitted' then raise exception 'Attempt has not been submitted'; end if;
 select * into a from public.assessments where id=at.assessment_id;
 if exists(select 1 from public.assessment_questions q left join public.assessment_responses r on r.question_id=q.id and r.attempt_id=at.id where q.assessment_id=a.id and (r.points_awarded is null or r.points_awarded<0 or r.points_awarded>q.points)) then raise exception 'Every answer needs a valid score before publication'; end if;
 select sum(q.points),sum(r.points_awarded) into maximum,total from public.assessment_questions q join public.assessment_responses r on r.question_id=q.id and r.attempt_id=at.id where q.assessment_id=a.id;
 if maximum is null or maximum<=0 then raise exception 'Assessment has no scorable questions'; end if;
 if a.classroom_id is not null then
   insert into public.grade_items(classroom_id,assessment_id,name,type,max_points,published) values(a.classroom_id,a.id,a.title,'quiz',maximum,true)
   on conflict(classroom_id,assessment_id) do update set max_points=excluded.max_points,name=excluded.name returning id into gi;
   insert into public.grade_entries(grade_item_id,student_id,points,graded_by) values(gi,at.student_id,total,a.created_by)
   on conflict(grade_item_id,student_id) do update set points=excluded.points,graded_by=excluded.graded_by,graded_at=now();
 end if;
 for item in select q.id,q.points,q.prompt,r.points_awarded,r.is_correct from public.assessment_questions q join public.assessment_responses r on r.question_id=q.id and r.attempt_id=at.id where q.assessment_id=a.id loop
   fraction:=case when item.points>0 then least(1,greatest(0,item.points_awarded/item.points)) else 0 end;
   insert into public.mastery_events(user_id,skill_id,skill_kind,event_type,score,correct,assessment_attempt_id)
   values(at.student_id,item.id,'assessment','quiz',fraction,item.is_correct,at.id) on conflict do nothing returning id into inserted;
   if inserted is not null then
     insert into public.skill_states(user_id,skill_id,skill_kind,status,strength,attempts,best_score,last_score)
     values(at.student_id,item.id,'assessment',case when fraction<0.6 then 'needs_remediation' when fraction>=0.8 then 'proficient' else 'developing' end,fraction,1,fraction,fraction)
     on conflict(user_id,skill_id) do update set skill_kind='assessment',status=excluded.status,strength=excluded.strength,attempts=1,best_score=excluded.best_score,last_score=excluded.last_score,last_event_at=now(),updated_at=now();
     if fraction<0.6 and not exists(select 1 from public.misconceptions where user_id=at.student_id and skill_id=item.id) then
       insert into public.misconceptions(user_id,skill_id,tag,description,status) values(at.student_id,item.id,left(item.prompt,80),'Missed on an assessment','open');
     end if;
   end if;
 end loop;
 update public.assessment_attempts set status='graded',published=true,score=total,max_score=maximum where id=at.id;
end $$;
revoke all on function public.commit_assessment_result(uuid) from public,anon,authenticated,service_role;
