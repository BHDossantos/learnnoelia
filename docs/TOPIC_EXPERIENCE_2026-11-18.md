# Topic and lesson experience research — November 18, 2026

This is a benchmark of ten established learning products across language learning, academic study, and professional education. It is not a numerical popularity ranking. Official product/help sources were inspected for current behavior; older articles are identified rather than described as new releases.

| Product and official evidence | Observed pattern | LearnNoelia decision |
| --- | --- | --- |
| [Duolingo](https://blog.duolingo.com/how-to-review-lessons-on-duolingo/) | Unit navigation and revisiting completed content | Retain open browsing; add a searchable unit explorer and mobile course contents. Never lock reading behind a quiz. |
| [Khan Academy](https://support.khanacademy.org/hc/en-us/articles/47078681852045-Where-can-I-view-my-skill-progress-in-Khan-Academy-Reimagined) | Skill states alongside course/unit progress | Reuse existing mastery evidence; show completion separately and add a Needs practice filter. |
| [Brilliant](https://brilliant.org/help/features/how-do-i-use-interactives-on-brilliant/) | Hands-on, step-by-step concepts and recovery | Existing code runners, quizzes and flashcards already provide interaction. Improve reading section navigation and completion failure recovery instead of replacing those engines. |
| [Coursera](https://www.coursera.support/s/article/learner-000002219?language=en_US) | Resume paths and visible course progress | Real per-topic completion and Continue links in the catalog; no invented deadlines, certificates, or activity. |
| [edX](https://support.edx.org/hc/en-us/articles/206503568-How-do-self-paced-courses-work) | Suggested pacing with freely available content | Optional 10/15/30-minute study suggestions derived from stored duration estimates. No hard timers or schedule enforcement. |
| [Codecademy](https://help.codecademy.com/hc/en-us/articles/220453248-Picking-Your-Learning-Path) | Clear milestones across lessons, quizzes, and projects | Preserve quiz-ended units and show unit completion. Session suggestions follow course order and do not jump past long/unknown-duration prerequisites. |
| [Quizlet](https://quizlet.com/features/learn) | Targeted practice based on existing learning evidence | Needs practice filter uses existing weak/developing states. Existing study-tools/flashcard capabilities are retained; no duplicate generator or unsupported adaptive claims. |
| [Udemy](https://support.udemy.com/hc/en-us/articles/360038492834-How-to-create-and-use-notes-on-a-browser) | Notes and curriculum accessible during learning | Existing notebook remains. Mobile contents and focus controls improve navigation without introducing another local note store or exposing personal notes. |
| [Babbel](https://support.babbel.com/hc/en-gb/articles/205600228-Vocab-workout-Review) | Review recommendations alongside new lessons | Surface weak topics alongside the curriculum while preserving the existing spaced-repetition scheduler and its evidence. |
| [Busuu](https://help.busuu.com/hc/en-us/articles/16941990776593-How-can-I-review-my-vocabulary) | Searchable review and visible strength states | Combine title/type search with practice, completion and duration filters. This help article is dated 2023; it is not evidence of a new 2026 feature. |

## Implemented across all seven schools

- Responsive topic cards: subject identity, readable descriptions, recorded completion, course-order/title/progress sorting, search, progress filters and resume links.
- Topic curriculum: diagnostic separation, unit progress, searchable lessons, unfinished/completed/needs-practice filters, length filters, empty-state recovery.
- Study session suggestions: use stored positive duration estimates; exclude completed lessons and optional opening diagnostics; stop at an unknown or oversized next lesson. Estimates are not actual time spent.
- Lesson reading: section table of contents, larger-text toggle, more readable spacing, focus mode and mobile course outline.
- Honest completion: reading lessons show success only after persistence succeeds, with retry on failure. The last navigation link says Back to topic rather than falsely implying course completion.
- Scope lesson lookups to the course in the URL. Paginate catalog lesson/progress reads so server response caps cannot undercount large schools.

## Existing capabilities and intentionally deferred scope

LearnNoelia already has pronunciation, roleplay, coding runners, quizzes, spaced review, notebooks, study tools, teacher grading and mastery. They were not duplicated. New AI tutors, paid features, community mechanics, generated curricula and calendar notifications require separate product/data/provider acceptance and are not introduced by this design pass. No payment, consent, auth, grading threshold or certificate eligibility rule changes.

## Verification

Pure tests cover unit grouping, ordered/bounded sessions, unknown durations, combined filters and paginated reads. Component regressions cover filtering/clearing, real resume links, and saving/retrying reading completion. Validation passed: 141 tests across 24 files, four storage tests, TypeScript, lint (two existing warnings), and production build. Static Chromium layouts were inspected at 390px and 1440px; interactive filter/save behavior is covered by component tests. Authenticated production journeys still require an approved QA account. Browser layout checks use clearly synthetic topic data without production accounts or data mutations.
