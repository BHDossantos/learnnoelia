-- Assessment engine (MVP core) — the foundation for formal, graded exams.
-- SECURE BY DESIGN: public question CONTENT lives apart from ANSWER KEYS, and
-- students can never read the keys (unlike the self-study `questions` bank, which
-- ships answers to the client for local grading). Grading runs server-side.
-- Reuses existing classrooms, profiles, and (later) the gradebook + mastery.
-- Idempotent. Depends on is_classroom_teacher / is_classroom_member (0043).

-- 1) An assessment (exam), scoped to a classroom.
create table if not exists public.assessments (
  id uuid primary key default uuid_generate_v4(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  time_limit_minutes int,                 -- null = untimed
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  available_at timestamptz,
  due_at timestamptz,
  total_points numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_assessments_classroom on public.assessments (classroom_id, status);

-- 2) PUBLIC question content — no answer here. Safe for an assigned student to
--    read while attempting a published assessment.
create table if not exists public.assessment_questions (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  position int not null default 0,
  kind text not null default 'mcq' check (kind in ('mcq', 'multi', 'short', 'written')),
  prompt text not null,
  options jsonb,                           -- choice strings for mcq/multi
  points numeric not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists idx_assessment_questions_assessment on public.assessment_questions (assessment_id, position);

-- 3) SERVER-ONLY answer keys. No student-facing read policy exists, so RLS makes
--    these unreadable to students entirely. Grading reads them server-side.
create table if not exists public.assessment_answer_keys (
  question_id uuid primary key references public.assessment_questions(id) on delete cascade,
  correct_index int,                       -- mcq: 0-based correct option
  correct_indices int[],                   -- multi: correct options
  correct_text text,                       -- short: accepted answer
  rubric text,                             -- written: grading rubric (AI + teacher)
  updated_at timestamptz not null default now()
);

-- 4) A student's attempt.
create table if not exists public.assessment_attempts (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'graded')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric,
  max_score numeric,
  published boolean not null default false,   -- results released to the student
  unique (assessment_id, student_id)
);
create index if not exists idx_assessment_attempts_assessment on public.assessment_attempts (assessment_id);
create index if not exists idx_assessment_attempts_student on public.assessment_attempts (student_id);

-- 5) Autosaved per-question responses + (after grading) score/feedback.
create table if not exists public.assessment_responses (
  id uuid primary key default uuid_generate_v4(),
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  question_id uuid not null references public.assessment_questions(id) on delete cascade,
  response jsonb,                          -- {index} | {indices} | {text}
  points_awarded numeric,
  is_correct boolean,
  feedback_md text,
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);
create index if not exists idx_assessment_responses_attempt on public.assessment_responses (attempt_id);

-- ===== Security-definer helpers (resolve an assessment to its classroom) =====
create or replace function public.is_assessment_teacher(p_assessment uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from assessments a
    where a.id = p_assessment and public.is_classroom_teacher(a.classroom_id)
  );
$$;
revoke all on function public.is_assessment_teacher(uuid) from public;
grant execute on function public.is_assessment_teacher(uuid) to authenticated;

-- A student may see a published assessment's questions if they're in the class.
create or replace function public.can_read_assessment(p_assessment uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from assessments a
    where a.id = p_assessment
      and (public.is_classroom_teacher(a.classroom_id)
           or (a.status = 'published' and public.is_classroom_member(a.classroom_id)))
  );
$$;
revoke all on function public.can_read_assessment(uuid) from public;
grant execute on function public.can_read_assessment(uuid) to authenticated;

-- Does auth.uid() own this attempt (and is it still open for writes)?
create or replace function public.owns_open_attempt(p_attempt uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from assessment_attempts at
    where at.id = p_attempt and at.student_id = auth.uid() and at.status = 'in_progress'
  );
$$;
revoke all on function public.owns_open_attempt(uuid) from public;
grant execute on function public.owns_open_attempt(uuid) to authenticated;

-- ===== RLS =====
alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_answer_keys enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_responses enable row level security;

-- assessments: teacher manages; student reads published ones in their class.
drop policy if exists "assess manage" on public.assessments;
create policy "assess manage" on public.assessments for all
  using (public.is_classroom_teacher(classroom_id))
  with check (public.is_classroom_teacher(classroom_id));
drop policy if exists "assess student read" on public.assessments;
create policy "assess student read" on public.assessments for select
  using (status = 'published' and public.is_classroom_member(classroom_id));

-- questions: teacher manages; student reads for a readable (published) assessment.
drop policy if exists "aq manage" on public.assessment_questions;
create policy "aq manage" on public.assessment_questions for all
  using (public.is_assessment_teacher(assessment_id))
  with check (public.is_assessment_teacher(assessment_id));
drop policy if exists "aq read" on public.assessment_questions;
create policy "aq read" on public.assessment_questions for select
  using (public.can_read_assessment(assessment_id));

-- answer keys: TEACHER ONLY. No student policy => students can never read them.
drop policy if exists "ak manage" on public.assessment_answer_keys;
create policy "ak manage" on public.assessment_answer_keys for all
  using (public.is_assessment_teacher((select q.assessment_id from public.assessment_questions q where q.id = question_id)))
  with check (public.is_assessment_teacher((select q.assessment_id from public.assessment_questions q where q.id = question_id)));

-- attempts: student manages own; teacher of the assessment reads/manages all.
drop policy if exists "att student" on public.assessment_attempts;
create policy "att student" on public.assessment_attempts for all
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);
drop policy if exists "att teacher" on public.assessment_attempts;
create policy "att teacher" on public.assessment_attempts for all
  using (public.is_assessment_teacher(assessment_id))
  with check (public.is_assessment_teacher(assessment_id));

-- responses: student writes own while the attempt is OPEN, reads own anytime;
-- teacher of the assessment reads/writes (grading).
drop policy if exists "resp student write" on public.assessment_responses;
create policy "resp student write" on public.assessment_responses for all
  using (public.owns_open_attempt(attempt_id))
  with check (public.owns_open_attempt(attempt_id));
drop policy if exists "resp student read" on public.assessment_responses;
create policy "resp student read" on public.assessment_responses for select
  using (exists (select 1 from public.assessment_attempts at where at.id = attempt_id and at.student_id = auth.uid()));
drop policy if exists "resp teacher" on public.assessment_responses;
create policy "resp teacher" on public.assessment_responses for all
  using (public.is_assessment_teacher((select at.assessment_id from public.assessment_attempts at where at.id = attempt_id)))
  with check (public.is_assessment_teacher((select at.assessment_id from public.assessment_attempts at where at.id = attempt_id)));
