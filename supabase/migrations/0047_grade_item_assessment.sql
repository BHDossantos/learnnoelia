-- Link a gradebook column to an assessment so a graded exam's score flows into
-- the existing gradebook (one gradebook, not two). Idempotent.
alter table public.grade_items add column if not exists assessment_id uuid references public.assessments(id) on delete set null;
create index if not exists idx_grade_items_assessment_ref on public.grade_items (assessment_id);
-- One gradebook column per (classroom, assessment) so grading can upsert it.
do $$ begin
  alter table public.grade_items add constraint grade_items_classroom_assessment_uniq unique (classroom_id, assessment_id);
exception when duplicate_table then null; when duplicate_object then null; end $$;
