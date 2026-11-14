# Teacher markings

Teachers can place red checks, crosses, and manually entered earned/possible
scores on the original image or a stable rendering of submitted text. Open
**Mark original work & view feedback** after single-paper grading, **Mark & view**
after bulk grading, or the **Teacher markings** section while reviewing an
assignment. Students see saved marks on their paper or assignment-result page;
paper guardians retain the existing read permissions. Print reports include the
saved marking layer.

Scores are labels, not a calculation: a cross can coexist with a 6/6 label.
Markings never change the overall grade, original answers, or system feedback.
Saving publishes the marks immediately to readers with existing access. Final
scores and the teacher's **Return to student** action remain separate.

## Editing

Choose a tool and click/tap the work. Undo/redo covers additions, removals and
corrections. Click a placed mark to remove it, or open the numbered review list
to remove a mark, switch correct/incorrect, or apply the entered fraction.
Save explicitly. Failed saves keep the draft; conflicts require reloading the
saved work before making another edit. The UI warns before leaving with unsaved
changes. Drafts are in memory, not guaranteed across browser crashes.

Image coordinates are normalized; text uses an 800px fixed layout with deterministic line breaks and SVG
text lengths, so different device fonts cannot reflow the marked answers. Zoom scales the work and marks together, with scrolling on small screens.
A keyboard user can place a mark at the center with Enter/Space and correct or
remove it using the review list; arbitrary keyboard positioning is not provided.

## Persistence and access

Apply `supabase/migrations/0052_teacher_markings.sql` before deploying this code.
This branch does not apply production migrations or deploy the app.

- `paper-originals` is a private bucket. Both paper-upload routes preserve original
  bytes before filing the grade. Original references cannot subsequently be
  replaced; user storage policies do not allow overwriting/deleting originals.
  Downloads use session-authorized, ten-minute signed links, never public URLs.
- `grading_markings` is separate from system-generated `annotations` and grades.
  Existing target RLS governs reads. Authenticated clients cannot write it
  directly. The save RPC checks the actual classroom/assignment teacher, validates
  bounded marks, and locks the target and mark version for a compare-and-save.
- Source fingerprints and stored text/file snapshots preserve previous work when
  a student resubmits. Current work starts a separate marking version. Historical
  versions are available read-only. Original assignment attachments referenced by
  a current submission or historical marks cannot be deleted through user storage
  policies.
- Account deletion removes the student's referenced paper originals (including
  teacher-uploaded ones) before cascading database deletion. Deleting a teacher
  does not delete other students' original papers.
- A failed database insert after a successful upload can leave an unreferenced
  private object. Administrative retention cleanup can remove such orphans;
  they have no reader policy grant through an associated paper.

## Scope and limitations

The explicit functional design brief specifies red checks, crosses, and manual
fractions. Undo, redo, zoom, version history, and correction controls are supporting
interaction tools, not claims about markings observed in the supplied images.
The implementation executor could not download the private references (network
403); the coordinating reviewer inspected them. Screenshots use synthetic work
only, for coordinating visual comparison. No private student images are committed.

Image scans (JPEG/PNG/WebP/GIF), pasted text, virtual text submissions, and virtual
image attachments support positioned marks. PDF/PowerPoint originals are retained
and openable; text/transcriptions can be marked when available, but native PDF or
slide-page overlays are not implemented. Historical scans whose bytes were never
retained cannot be reconstructed; uploading the original creates a new markable
paper. Hand-drawn freehand ink, green highlights, and automatic mark detection are
not included. On-page marks are included in the print view, not burned into the
original or embedded in outbound email bodies.

## Validation

- `npm test`: schema, positions, upload preservation/failure, HTTP boundary,
  account cleanup, and real PostgreSQL-engine (PGlite) save/reload, permissions,
  corrections, conflicts, resubmission history, and storage-reference protection.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test e2e/markings.spec.ts`:
  actual Next routes, local auth/PostgREST/Postgres, synthetic images, browser
  editing/reload, failure recovery, concurrent saves, permissions, zoom/scroll,
  and historical work. The local storage stub does not enforce storage RLS;
  storage-policy behavior is separately exercised in PGlite.
- Typecheck, lint and production build. Existing unrelated lint warnings remain.
- All 52 migrations applied to a separate local PostgreSQL database. Existing
  `02_smoke.sql` passed with the core sample seeds. The generic root-seed loop
  encounters an existing curriculum mapping FK failure because its referenced
  arithmetic course is in the separate curriculum seed directory.

Live model grading calls, hosted Supabase storage, deployment and production
migration application are not exercised by these local tests.

Synthetic browser captures: [scan](markings/scanned-markings.png) and
[virtual work](markings/virtual-markings.png). These contain no real student data.

Verified locally on 2026-11-14: 14 targeted browser tests passed (markings,
permissions/auth, assignment upload, account deletion). The upload regression's
background model-grading call logs missing provider authentication in the local
stack; submission storage and the marking flows pass independently.

Final checks: `npm test` passed 144 Vitest tests across 21 files plus four storage
stub tests; `npm run typecheck`, `npm run lint`, and `npm run build` passed. The
final build reports only the pre-existing SessionRoom hook-dependency and
AttachmentViewer image-optimization warnings. The migration was also reapplied
successfully to confirm idempotence.
