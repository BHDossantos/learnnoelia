-- Populate every course that has a lesson question-bank with REAL graded exams
-- (System A), unifying the two exam approaches. generate_course_exams() converts
-- a course's valid MCQ lesson questions into 12 quizzes + 4 exams with secure
-- answer keys via seed_course_assessment(). Idempotent per course. Run across the
-- catalog with:  select sum(generate_course_exams(id, '<author profile>'))
--                from courses where published;
-- (seed_course_assessment total_points now defaults each question to 1 point.)

create or replace function public.seed_course_assessment(
  p_course uuid, p_created_by uuid, p_kind text, p_title text, p_desc text,
  p_position int, p_time_limit int, p_questions jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare aid uuid; q jsonb; qid uuid; pos int := 0;
begin
  insert into assessments(course_id, created_by, title, description, kind, position, time_limit_minutes, status, total_points)
  values (p_course, p_created_by, p_title, p_desc, p_kind, p_position, p_time_limit, 'published',
          (select coalesce(sum(coalesce((x->>'points')::numeric,1)),1) from jsonb_array_elements(p_questions) x))
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

create or replace function public.generate_course_exams(p_course uuid, p_created_by uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  bank jsonb := '[]'::jsonb; seen text[] := '{}';
  lbody jsonb; qel jsonb; norm text;
  n int; third int; i int; j int; startidx int; cnt int; qs jsonb; poolstart int; poollen int; made int := 0;
begin
  if exists (select 1 from assessments where course_id = p_course) then return 0; end if;

  for lbody in select body from lessons where course_id = p_course order by position, id loop
    if jsonb_typeof(lbody->'questions') = 'array' then
      for qel in select value from jsonb_array_elements(lbody->'questions') loop
        if jsonb_typeof(qel->'prompt')='string'
           and jsonb_typeof(qel->'options')='array'
           and jsonb_array_length(qel->'options') between 2 and 8
           and jsonb_typeof(qel->'answer')='number'
           and (qel->>'answer')::int >= 0
           and (qel->>'answer')::int < jsonb_array_length(qel->'options')
           and (select bool_and(jsonb_typeof(o.value)='string') from jsonb_array_elements(qel->'options') o)
        then
          norm := lower(btrim(qel->>'prompt'));
          if norm <> '' and not (norm = any(seen)) then
            seen := array_append(seen, norm);
            bank := bank || jsonb_build_array(jsonb_build_object(
              'kind','mcq','prompt', qel->>'prompt', 'options', qel->'options',
              'correct_index', (qel->>'answer')::int));
          end if;
        end if;
      end loop;
    end if;
  end loop;

  n := jsonb_array_length(bank);
  if n < 12 then return 0; end if;

  for i in 0..11 loop
    startidx := (i * n) / 12;
    cnt := least(5, greatest(3, n/12));
    qs := '[]'::jsonb;
    for j in 0..(cnt-1) loop qs := qs || jsonb_build_array(bank->(((startidx + j) % n))); end loop;
    perform seed_course_assessment(p_course, p_created_by, 'quiz', 'Quiz '||(i+1),
      'Retrieval practice drawn from the course material.', i+1, null, qs);
    made := made + 1;
  end loop;

  third := n / 3;
  for i in 0..2 loop
    poolstart := i * third;
    poollen := case when i < 2 then third else n - 2*third end;
    cnt := least(12, poollen);
    qs := '[]'::jsonb;
    for j in 0..(cnt-1) loop qs := qs || jsonb_build_array(bank->(poolstart + (j * poollen / cnt))); end loop;
    perform seed_course_assessment(p_course, p_created_by, 'exam',
      'Exam '||(i+1)||' · '||(array['Foundations','Developing understanding','Connecting ideas'])[i+1],
      'Staged exam over part '||(i+1)||' of the course.', i+1, 30, qs);
    made := made + 1;
  end loop;

  cnt := least(20, n);
  qs := '[]'::jsonb;
  for j in 0..(cnt-1) loop qs := qs || jsonb_build_array(bank->((j * n / cnt))); end loop;
  perform seed_course_assessment(p_course, p_created_by, 'exam', 'Final Exam · Cumulative review',
    'A balanced sample from across the whole course.', 4, 60, qs);
  made := made + 1;

  return made;
end $$;
revoke all on function public.generate_course_exams(uuid,uuid) from public, anon, authenticated;
