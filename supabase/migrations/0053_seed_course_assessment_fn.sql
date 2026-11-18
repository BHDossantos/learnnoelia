-- JSON-driven seeder for course-level assessments (quizzes & exams). Inserts the
-- assessment, its public questions, and the server-only answer keys from one JSON
-- array. Auto-gradable kinds only (mcq / truefalse / numeric / multi / short) so
-- course assessments self-publish on submit. Server-only; not granted to clients.
-- Used to seed the catalog courses' exams and by the generation pipeline.
create or replace function public.seed_course_assessment(
  p_course uuid, p_created_by uuid, p_kind text, p_title text, p_desc text,
  p_position int, p_time_limit int, p_questions jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare aid uuid; q jsonb; qid uuid; pos int := 0;
begin
  insert into assessments(course_id, created_by, title, description, kind, position, time_limit_minutes, status, total_points)
  values (p_course, p_created_by, p_title, p_desc, p_kind, p_position, p_time_limit, 'published',
          (select coalesce(sum((x->>'points')::numeric),1) from jsonb_array_elements(p_questions) x))
  returning id into aid;
  for q in select value from jsonb_array_elements(p_questions) loop
    insert into assessment_questions(assessment_id, position, kind, prompt, options, points)
    values (aid, pos, coalesce(q->>'kind','mcq'), q->>'prompt',
            case when q ? 'options' then q->'options' else null end,
            coalesce((q->>'points')::numeric, 1))
    returning id into qid;
    insert into assessment_answer_keys(question_id, correct_index, correct_indices, correct_text, correct_number, number_tolerance, rubric)
    values (qid,
            case when q ? 'correct_index' then (q->>'correct_index')::int end,
            case when q ? 'correct_indices' then array(select jsonb_array_elements_text(q->'correct_indices'))::int[] end,
            case when q ? 'correct_text' then q->>'correct_text' end,
            case when q ? 'correct_number' then (q->>'correct_number')::numeric end,
            case when q ? 'number_tolerance' then (q->>'number_tolerance')::numeric end,
            case when q ? 'rubric' then q->>'rubric' end);
    pos := pos + 1;
  end loop;
  return aid;
end $$;
revoke all on function public.seed_course_assessment(uuid,uuid,text,text,text,int,int,jsonb) from public, anon, authenticated;
