-- Standards-based gradebook: tag each assessment question with a curriculum
-- standard (free text, e.g. "CCSS.MATH.8.EE.7", "IB Criterion A", "AP Bio 1.2")
-- so performance can be reported per standard. Idempotent.
alter table public.assessment_questions add column if not exists standard text;
create index if not exists idx_assessment_questions_standard on public.assessment_questions (assessment_id, standard);
