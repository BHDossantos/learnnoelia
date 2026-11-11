-- Assessment expansion: more question types, AI/anonymous/accommodation support.
-- Idempotent. Builds on 0046.

-- 1) Widen question kinds: add true/false and numeric.
alter table public.assessment_questions drop constraint if exists assessment_questions_kind_check;
alter table public.assessment_questions add constraint assessment_questions_kind_check
  check (kind in ('mcq', 'multi', 'short', 'written', 'truefalse', 'numeric'));

-- 2) Numeric answer keys (value + optional tolerance).
alter table public.assessment_answer_keys add column if not exists correct_number numeric;
alter table public.assessment_answer_keys add column if not exists number_tolerance numeric;

-- 3) Anonymous grading: hide student identity while reviewing.
alter table public.assessments add column if not exists anonymous_grading boolean not null default false;

-- 4) Per-student accommodations (extra time %).
create table if not exists public.assessment_accommodations (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  extra_time_pct int not null default 0 check (extra_time_pct between 0 and 300),
  note text,
  primary key (assessment_id, student_id)
);
alter table public.assessment_accommodations enable row level security;

drop policy if exists "accom teacher" on public.assessment_accommodations;
create policy "accom teacher" on public.assessment_accommodations for all
  using (public.is_assessment_teacher(assessment_id))
  with check (public.is_assessment_teacher(assessment_id));
drop policy if exists "accom student read" on public.assessment_accommodations;
create policy "accom student read" on public.assessment_accommodations for select
  using (auth.uid() = student_id);
