# Consolidated LearnNoelia request and release checklist

Updated 18 November 2026. Scope: requests visible in this task and related accessible parent/room history. This does not certify access to every separate ChatGPT conversation. Historical mobile-readiness request (15 November) was recovered from room history; this chat adds a requirement to notify only when the full requested scope is ready for acceptance testing.

| Request | Verified status | Evidence / remaining work |
|---|---|---|
| Research best learning products in detail | Selected 15-product benchmark documented; three teacher-specific comparators added | LEARNING_PLATFORM_BENCHMARK_2026-11-18.md and TEACHER_WORKFLOW_2026-11-18.md. Not a proven popularity ranking. |
| Improve all academic topic reading design | Shared guided renderer shipped in PR76 | Individual steps/cases, optional full view, mobile/desktop browser checks. Content-specific visual teaching still incomplete. |
| Relevant course images | Original decorative illustrations shipped | Shared compressed asset and subject mapping. Not authentic photos or validated diagrams. |
| Practice must stay on the subject | In-lesson practice and course navigation shipped | Biology browser checks; language-specific navigation retained only for language courses. |
| Your turn as selectable quizzes | Partial | Six reviewed biology conversions and general authored MCQ rendering. Reviewed choices for every topic remain incomplete. |
| Four exams and about twelve quizzes per course | Partial | Slots sourced from valid authored questions, clear availability and question reuse. Independent balanced assessment authoring/validation remains incomplete. |
| Flashcards based on the topic | Shipped in PR76 | Course picker/context and source-backed decks; local recall queue. |
| Teacher demo with a fully marked paper | Shipped in PR76 | Fictional paper, rubric, comments, inline corrections, 80/100 and print view. |
| Full John Doe family report and matching teacher evidence | Demo shipped; production integration incomplete | Fictional attendance/study/grades/notes/focus plan. Real parent screen not yet full reporting. |
| AI full report analysis | Fictional report analysis implemented | Explicit generation from fixed fictional data; provider output still requires teacher review. No verified real-family AI report rollout. |
| Minimal-click daily teacher workflow | Implementation validated locally on follow-up branch | Real class worklist, batch feedback preparation, prefilled review, yellow rubric highlights and saved question markings. Current PR/CI must be checked before claiming live. |
| Paid tutoring repaired | Blocked on verified app/account configuration and acceptance | Preserve fail-closed gates. Visible other-product Stripe sandboxes are not LearnNoelia merchant evidence. Production metadata lacked Stripe/LiveKit variable names at last inspection. |
| Mobile application ready to test and release | Not yet certified | Capacitor com.learnnoelia.app loads hosted web app. Historical signed uploads are recorded in MOBILE_VALIDATION.md; latest exact build/device/store evidence still required. |
| Everything from all chats complete | Not met | Missing content, production report, payment and mobile evidence above. Do not issue a full-completion notification. |

## Verified release checkpoint

PR76 head `11d1f71e03fc73387407f9bac08dfc1d972120cd`, merged as `7f0342fcb55eddd593e769e84172cf21bd44d895`. Vercel deployment `dpl_DkewEdiQJTRYCGPkT9ZARYEatMkT` reported READY on learnnoelia.com for that merge. Local checks included production build, typecheck, lint with existing warnings, units/storage tests, five new browser scenarios plus eleven existing auth/lesson/quiz scenarios. Subsequent work must cite its own commit and checks, not reuse this as proof.

## Mobile acceptance evidence required

Record candidate SHA, Android APK/AAB and iOS build numbers, native CI artifacts, installation on test devices/TestFlight/internal track, signup/session recovery, lessons/practice, teacher and parent workflows, microphone/camera permissions, offline/reconnect, background/resume, accessibility, account deletion and purchase-entry behavior. Confirm current store metadata/privacy declarations and reviewer access before submission. No signed release or store approval is established by the web READY status.

An hourly readiness watch was created at the user's request. It checks evidence and notifies only when all requested items are implemented and ready for acceptance testing; it does not perform deployments or substitute for this work.
