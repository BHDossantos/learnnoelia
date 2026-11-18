# Teacher workflow implementation

The [15-product learning benchmark](./LEARNING_PLATFORM_BENCHMARK_2026-11-18.md) is a selected comparison, not an independently verified popularity ranking. No research establishes a universal “most loved” top fifteen. For the teacher-specific follow-up, three closer comparators matter:

- [Google Classroom: grade, assess and provide feedback](https://support.google.com/edu/classroom/answer/16643267?hl=en): assignment/grade/missing-work overview, status filters, prepared comments and explicit return. Adopted: a class daily worklist with status filters and visible prepared feedback.
- [Canvas SpeedGrader](https://community.instructure.com/en/instructure/kb/articles/662775-what-is-speedgrader): submissions, rubric and feedback in one workflow, with posting controls. Adopted: prefilled review explanation, colored rubric deficits/strengths, explicit review-and-return, and a prominent Daily review class entry.
- [Gradescope](https://www.gradescope.com/help): rubric-driven feedback, batch workflows and review of uncertain marks before publishing. Adopted: prepare up to 20 visible ungraded text submissions, retryable per-item results, validated grading output and explicit distinction between proposed and returned scores. No claim of Gradescope's answer grouping, item discrimination or grading accuracy.

## Day-to-day flow

Teach → Daily review on a class opens real roster/course-completion data and the current teacher's published course assignments. It loads pages of records and scopes assignment rows to actual course enrollments. Overdue is derived from a real deadline and missing submission, not from a zero grade. Student drafts never enter batch grading.

One Prepare feedback button processes up to 20 matching eligible text submissions sequentially through the existing grading API/provider. The teacher sees progress and individual failures, can retry failures, and opens each prepared result with feedback and score filled in. The existing explicit Return to student action remains. No background job, email, auto-publish or new external provider is added.

On saved paper reports, per-question annotations are now visible directly rather than only in the print view. Incorrect answers use a red circled mark and yellow review block; correct answers use green. Missing/unknown classifications are not shown as wrong. These are saved model judgments, not proof of correctness or actual ink overlays on an uploaded PDF.

Grading rejects empty text, student drafts, already-returned submissions, invalid JSON, mismatched maximums and out-of-range scores/rubric marks. Provider failures leave the original work intact. Review-and-return checks ownership, maximum score and database errors before reporting success.

## Fifteen useful capabilities and actual status

1. Guided short lessons — implemented in PR76.
2. Separate worked examples — implemented in PR76.
3. Selected-answer practice and explanations — renderer plus six reviewed biology conversions; catalog-wide authoring incomplete.
4. Topic flashcards — implemented; existing language SRS remains separate.
5. Course-specific assessment plans — four exam/twelve quiz slots; depends on authored question coverage, not sixteen validated independent tests per course.
6. Visual course discovery — original decorative subject covers and existing search/filtering.
7. Offline lesson materials — practice sheets and separate explanations.
8. Resume/navigation context — lesson map and course-scoped study links; no claim of cross-device scratch-work sync.
9. Class completion overview — real data in daily review.
10. Missing/overdue work queue — real enrollment/deadline/submission data in daily review.
11. Batch feedback preparation — explicit teacher action, maximum twenty text submissions per batch.
12. Visible rubric and question markings — saved evidence rendered directly; no fabricated source-text annotations.
13. Prefilled review and return — existing workflow surfaced and error handling improved.
14. Family/teacher report — full fictional demonstration; production full reporting still needs approved data integration and policy/calendar support.
15. AI student-report narrative — fictional report demo only; real assignment feedback uses existing authorized grading provider.

These are product choices aligned with the user's goals, not a measured claim of popularity or superiority. Remaining gaps include a unified classroom-exam results panel (existing dedicated tool linked), paper review approval/versioning, validated all-course assessment authoring, real family reporting, configurable intervention rules, and usability testing with Noelia. No completion/attendance/grade equivalence is inferred.
