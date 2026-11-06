-- All result mutations take the attempt lock. Clients may read through existing
-- RLS, but cannot bypass validation by directly writing scores or status.
revoke insert,update,delete on public.assessment_attempts,public.assessment_responses from public,anon,authenticated;
alter table public.skill_states drop constraint if exists skill_states_skill_kind_check;
alter table public.skill_states add constraint skill_states_skill_kind_check check(skill_kind in ('lesson','concept','skill','assessment'));
alter table public.mastery_events add column assessment_attempt_id uuid references public.assessment_attempts(id) on delete cascade;
create unique index assessment_mastery_once on public.mastery_events(assessment_attempt_id,skill_id) where assessment_attempt_id is not null;
-- Preserve general self-study evidence policies, excluding formal assessments.
drop policy if exists "own mastery_events" on public.mastery_events;
create policy "own mastery_events" on public.mastery_events for all using(auth.uid()=user_id and assessment_attempt_id is null and skill_kind<>'assessment') with check(auth.uid()=user_id and assessment_attempt_id is null and skill_kind<>'assessment');
create policy "read own assessment evidence" on public.mastery_events for select using(auth.uid()=user_id);
drop policy if exists "own skill_states" on public.skill_states;
create policy "own skill_states" on public.skill_states for all using(auth.uid()=user_id and skill_kind<>'assessment') with check(auth.uid()=user_id and skill_kind<>'assessment');
create policy "read own assessment state" on public.skill_states for select using(auth.uid()=user_id);

create function public.start_assessment_attempt(p_assessment uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.assessments; result uuid;
begin
 select * into a from public.assessments where id=p_assessment for update;
 if auth.uid() is null or not found or a.status<>'published' or not public.is_classroom_member(a.classroom_id) then raise exception 'Assessment unavailable'; end if;
 insert into public.assessment_attempts(assessment_id,student_id) values(a.id,auth.uid()) on conflict(assessment_id,student_id) do nothing;
 select id into result from public.assessment_attempts where assessment_id=a.id and student_id=auth.uid();
 return result;
end $$;
revoke all on function public.start_assessment_attempt(uuid) from public,anon;
grant execute on function public.start_assessment_attempt(uuid) to authenticated;

create function public.save_assessment_response(p_attempt uuid,p_question uuid,p_response jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare a public.assessment_attempts;
begin
 select * into a from public.assessment_attempts where id=p_attempt for update;
 if auth.uid() is null or not found or a.student_id<>auth.uid() or a.status<>'in_progress' then raise exception 'Attempt is unavailable or already submitted'; end if;
 if not exists(select 1 from public.assessment_questions where id=p_question and assessment_id=a.assessment_id) then raise exception 'Question not in this assessment'; end if;
 if pg_catalog.pg_column_size(p_response)>100000 then raise exception 'Answer too large'; end if;
 insert into public.assessment_responses(attempt_id,question_id,response) values(a.id,p_question,p_response)
 on conflict(attempt_id,question_id) do update set response=excluded.response,updated_at=now();
end $$;
revoke all on function public.save_assessment_response(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_assessment_response(uuid,uuid,jsonb) to authenticated;

-- Freeze question/key definitions once an attempt exists. This also makes the
-- server-side grading snapshot stable while an answer submission is in flight.
create function public.guard_assessment_definition() returns trigger language plpgsql security definer set search_path='' as $$
declare aid uuid;
begin
 if tg_table_name='assessment_questions' then
   if tg_op='INSERT' then aid:=new.assessment_id; else aid:=old.assessment_id; end if;
   if tg_op='UPDATE' and new.assessment_id<>old.assessment_id then raise exception 'Cannot move a question'; end if;
 else
   if tg_op='INSERT' then select assessment_id into aid from public.assessment_questions where id=new.question_id;
   else select assessment_id into aid from public.assessment_questions where id=old.question_id; end if;
   if tg_op='UPDATE' and new.question_id<>old.question_id then raise exception 'Cannot move an answer key'; end if;
 end if;
 perform 1 from public.assessments where id=aid for update;
 -- Parent deletion cascades are allowed; direct edits remain locked.
 if not found then if tg_op='DELETE' then return old; else return new; end if; end if;
 if exists(select 1 from public.assessment_attempts where assessment_id=aid) then raise exception 'Assessment has attempts; create a new assessment to change questions or keys'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.guard_assessment_definition() from public,anon,authenticated;
create trigger freeze_assessment_questions before insert or update or delete on public.assessment_questions for each row execute function public.guard_assessment_definition();
create trigger freeze_assessment_keys before insert or update or delete on public.assessment_answer_keys for each row execute function public.guard_assessment_definition();

-- Internal helper: caller already holds the attempt lock. The gradebook,
-- evidence and derived skill states are committed in this same transaction.
create function public.commit_assessment_result(p_attempt uuid) returns void language plpgsql security definer set search_path='' as $$
declare at public.assessment_attempts; a public.assessments; gi uuid; total numeric; maximum numeric; item record; fraction real; inserted bigint;
begin
 select * into at from public.assessment_attempts where id=p_attempt for update;
 if at.published then return; end if;
 if at.status<>'submitted' then raise exception 'Attempt has not been submitted'; end if;
 select * into a from public.assessments where id=at.assessment_id;
 if exists(select 1 from public.assessment_questions q left join public.assessment_responses r on r.question_id=q.id and r.attempt_id=at.id where q.assessment_id=a.id and (r.points_awarded is null or r.points_awarded<0 or r.points_awarded>q.points)) then raise exception 'Every answer needs a valid score before publication'; end if;
 select sum(q.points),sum(r.points_awarded) into maximum,total from public.assessment_questions q join public.assessment_responses r on r.question_id=q.id and r.attempt_id=at.id where q.assessment_id=a.id;
 if maximum is null or maximum<=0 then raise exception 'Assessment has no scorable questions'; end if;
 insert into public.grade_items(classroom_id,assessment_id,name,type,max_points,published) values(a.classroom_id,a.id,a.title,'quiz',maximum,true)
 on conflict(classroom_id,assessment_id) do update set max_points=excluded.max_points,name=excluded.name returning id into gi;
 insert into public.grade_entries(grade_item_id,student_id,points,graded_by) values(gi,at.student_id,total,a.created_by)
 on conflict(grade_item_id,student_id) do update set points=excluded.points,graded_by=excluded.graded_by,graded_at=now();
 for item in select q.id,q.points,q.prompt,r.points_awarded,r.is_correct from public.assessment_questions q join public.assessment_responses r on r.question_id=q.id and r.attempt_id=at.id where q.assessment_id=a.id loop
   fraction:=case when item.points>0 then least(1,greatest(0,item.points_awarded/item.points)) else 0 end;
   insert into public.mastery_events(user_id,skill_id,skill_kind,event_type,score,correct,assessment_attempt_id)
   values(at.student_id,item.id,'assessment','quiz',fraction,item.is_correct,at.id) on conflict do nothing returning id into inserted;
   if inserted is not null then
     -- One attempt per learner/assessment: one item is one evidence point, not
     -- sustained mastery. Old inflated assessment aggregates are replaced.
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

-- Only the trusted server can submit computed grades. Identity comes from its
-- verified user session; clients never receive answer keys or this capability.
create function public.submit_assessment_result(p_attempt uuid,p_actor uuid,p_results jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare at public.assessment_attempts; q public.assessment_questions; r jsonb;
begin
 select * into at from public.assessment_attempts where id=p_attempt for update;
 if not found or p_actor is null or at.student_id<>p_actor then raise exception 'Attempt not found'; end if;
 if at.status<>'in_progress' then return at.assessment_id; end if;
 if p_results is null or jsonb_typeof(p_results)<>'array' or jsonb_array_length(p_results)=0 or jsonb_array_length(p_results)<>(select count(*) from public.assessment_questions where assessment_id=at.assessment_id) or (select count(distinct value->>'question_id') from jsonb_array_elements(p_results))<>jsonb_array_length(p_results) then raise exception 'Incomplete grading result'; end if;
 for r in select value from jsonb_array_elements(p_results) loop
   select * into q from public.assessment_questions where id=(r->>'question_id')::uuid and assessment_id=at.assessment_id;
   if not found or q.points<0 or q.points::text in ('NaN','Infinity','-Infinity') or (q.kind<>'written' and (r->>'points_awarded' is null or (r->>'points_awarded')::numeric<0 or (r->>'points_awarded')::numeric>q.points)) or (q.kind='written' and r->>'points_awarded' is not null) then raise exception 'Invalid grading result'; end if;
   insert into public.assessment_responses(attempt_id,question_id,response,points_awarded,is_correct) values(at.id,q.id,r->'response',(r->>'points_awarded')::numeric,(r->>'is_correct')::boolean)
   on conflict(attempt_id,question_id) do update set response=excluded.response,points_awarded=excluded.points_awarded,is_correct=excluded.is_correct,updated_at=now();
 end loop;
 update public.assessment_attempts set status='submitted',submitted_at=now(),score=(select sum(points_awarded) from public.assessment_responses where attempt_id=at.id),max_score=(select sum(points) from public.assessment_questions where assessment_id=at.assessment_id) where id=at.id;
 if not exists(select 1 from public.assessment_questions where assessment_id=at.assessment_id and kind='written') then perform public.commit_assessment_result(at.id); end if;
 return at.assessment_id;
end $$;
revoke all on function public.submit_assessment_result(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.submit_assessment_result(uuid,uuid,jsonb) to service_role;

create function public.score_assessment_written(p_classroom uuid,p_attempt uuid,p_question uuid,p_points numeric,p_feedback text) returns void
language plpgsql security definer set search_path='' as $$
declare at public.assessment_attempts; maximum numeric;
begin
 select * into at from public.assessment_attempts where id=p_attempt for update;
 if auth.uid() is null or not found or not exists(select 1 from public.assessments where id=at.assessment_id and classroom_id=p_classroom and public.is_classroom_teacher(classroom_id)) then raise exception 'Attempt not found'; end if;
 if at.status<>'submitted' or at.published then raise exception 'Only submitted, unpublished attempts can be scored'; end if;
 select points into maximum from public.assessment_questions where id=p_question and assessment_id=at.assessment_id and kind='written';
 if not found or p_points is null or p_points<0 or p_points>maximum or p_points::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid written score'; end if;
 update public.assessment_responses set points_awarded=p_points,is_correct=(p_points=maximum),feedback_md=p_feedback,updated_at=now() where attempt_id=at.id and question_id=p_question;
 if not found then raise exception 'Response not found'; end if;
end $$;
revoke all on function public.score_assessment_written(uuid,uuid,uuid,numeric,text) from public,anon;
grant execute on function public.score_assessment_written(uuid,uuid,uuid,numeric,text) to authenticated;

create function public.publish_assessment_result(p_classroom uuid,p_attempt uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare at public.assessment_attempts;
begin
 select * into at from public.assessment_attempts where id=p_attempt for update;
 if auth.uid() is null or not found or not exists(select 1 from public.assessments where id=at.assessment_id and classroom_id=p_classroom and public.is_classroom_teacher(classroom_id)) then raise exception 'Attempt not found'; end if;
 perform public.commit_assessment_result(at.id);
 return at.assessment_id;
end $$;
revoke all on function public.publish_assessment_result(uuid,uuid) from public,anon;
grant execute on function public.publish_assessment_result(uuid,uuid) to authenticated;
