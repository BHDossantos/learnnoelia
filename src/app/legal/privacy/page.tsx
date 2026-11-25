import Link from "next/link";

export const metadata = { title: "Privacy Policy — Noelia" };

// Comprehensive privacy policy tailored to what Noelia actually does. Governing
// context set to New Hampshire, USA with operations in Rome, Italy. Counsel
// should do a final review (esp. COPPA/FERPA/GDPR) and confirm the legal entity
// name before public launch.
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-prose space-y-5 pb-10 text-sm leading-relaxed text-ink-700">
      <div>
        <Link href="/" className="text-sm text-brand-500">← Home</Link>
        <h1 className="mt-1 text-2xl font-bold text-ink-900">Privacy Policy</h1>
        <p className="text-xs text-ink-500">Last updated: October 9, 2026</p>
      </div>

      <p>
        This Privacy Policy explains how Noelia (“Noelia”, “we”, “us”) — based in New
        Hampshire, United States, with operations in Rome, Italy — collects, uses, shares,
        and protects information when you use learnnoelia.com and our mobile apps (together,
        the “Service”). By using the Service you agree to this Policy. If you do not agree,
        please do not use the Service.
      </p>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink-900">1. Who this applies to</h2>
        <p>
          The Service is used by individual learners, and by schools and organizations
          with teachers, students, and parents/guardians. Where a school or organization
          uses Noelia with its students, that school is the controller of its students’
          personal data and Noelia acts as its service provider (and, in the United States,
          as a “school official” under FERPA). In that case the school’s own privacy notice
          and consents also apply.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink-900">2. Information we collect</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Account &amp; profile:</strong> email, password (stored only as a secure hash by our authentication provider), display name, role (student, teacher, parent, admin), and optional contact or parent/guardian email.</li>
          <li><strong>Learning preferences:</strong> target languages, level (CEFR), goals, time zone, and reminder settings.</li>
          <li><strong>Learning activity:</strong> lessons and courses viewed and completed, quiz answers, spaced-repetition review ratings, mastery and retention records, pronunciation attempt scores, streaks and points, projects, and certificates earned.</li>
          <li><strong>Submissions you provide:</strong> assignment and project submissions, notes, and—when you or your teacher use grading—uploaded files such as photos, scans, PDFs, or PowerPoint/Word documents of student work, and the text read from them.</li>
          <li><strong>Messages &amp; interactions:</strong> conversations with the AI coach and translation tools, discussion posts, and messages in a classroom.</li>
          <li><strong>School/classroom data:</strong> organization and classroom membership, rosters, attendance, grades and gradebook entries, announcements, and guardian–student links.</li>
          <li><strong>Payment data:</strong> if you subscribe or pay for tutoring, our payment processor collects and stores your payment details. We receive confirmation and limited billing metadata but do not store full card numbers.</li>
          <li><strong>Live sessions:</strong> if you join a live class or tutoring session, connection data needed to deliver real-time audio/video.</li>
          <li><strong>Technical &amp; usage data:</strong> device and browser information, IP address, pages and features used, performance and error logs, and A/B-experiment assignments, collected to operate and improve the Service.</li>
        </ul>
        <p className="text-xs text-ink-500">
          Personal notes you take in the app are stored only in your own browser and are not sent to our servers.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink-900">3. How we use information</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Provide and personalize the Service—scheduling reviews, tracking mastery, generating feedback and grades, and showing your progress.</li>
          <li>Where you join a classroom or link a guardian, share relevant learning data with your teachers, school, and linked parents/guardians.</li>
          <li>Process payments and manage subscriptions and tutoring sessions.</li>
          <li>Send service messages and, if enabled, learning reminders and notifications.</li>
          <li>Maintain security, prevent abuse, debug, and improve the Service.</li>
          <li>Comply with legal obligations.</li>
        </ul>
        <p><strong>We do not sell your personal information, and we do not use student data for advertising.</strong></p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink-900">4. AI processing of your work</h2>
        <p>
          Features like the coach, instant feedback, paper/assignment grading, and
          translation send the relevant text—and, for paper grading, the uploaded image or
          document—to our AI provider to generate feedback, a grade, or a translation. This
          processing is done to deliver the feature you requested. AI-generated grades and
          feedback are assistive and may contain errors; a teacher should review them before
          they count. Our AI provider processes this content to return a result and under our
          agreement does not use it to train general models.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink-900">5. Children and students</h2>
        <p>
          Noelia can be used by children through a school or with parental involvement. Where a
          school directs use of the Service, the school provides the consent required under
          laws such as COPPA and FERPA and is responsible for the data of its students; Noelia
          uses student personal information only to provide the educational service to the
          school and not for advertising. Teachers can create student accounts for grading; a
          placeholder login is created that the student or school can later claim with a real
          email. If you believe a child has provided us personal information without the
          appropriate consent, contact us and we will delete it.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink-900">6. How we share information</h2>
        <p>We share personal information only as described here:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>With your school/teachers/guardians</strong> when you are in a classroom or have linked a guardian, limited to the learning data they are entitled to see.</li>
          <li><strong>With service providers (sub-processors)</strong> who host and operate the Service on our behalf: cloud hosting and database/authentication/storage (Supabase), application hosting (Vercel), payments (Stripe), real-time audio/video (LiveKit), AI processing (Anthropic), transactional email, and push notifications. They may process data only on our instructions.</li>
          <li><strong>For legal reasons</strong>—to comply with law, enforce our terms, or protect rights and safety.</li>
          <li><strong>In a business transfer</strong>—if we are involved in a merger, acquisition, or sale of assets, subject to this Policy.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink-900">7. Your rights and choices</h2>
        <p>
          You can view and update your profile, and <strong>export</strong> your data or
          <strong> delete your account</strong> from Settings. Deletion permanently removes
          your profile and learning history. Depending on where you live, you may have rights
          to access, correct, delete, restrict, or port your personal data, and to object to
          certain processing (GDPR), or to know about and delete personal information and to
          not be discriminated against for exercising these rights (CCPA/CPRA). We do not sell
          or “share” personal information for cross-context behavioral advertising. If your data
          is managed by your school, please direct requests to your school, which we will
          support. You can also <Link href="/legal/delete-account" className="underline">request account deletion on the web</Link>.
          To exercise other rights, contact us using the details below.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink-900">8. Data retention</h2>
        <p>
          We keep personal data for as long as your account is active or as needed to provide
          the Service, then delete or anonymize it, except where we must retain it to meet
          legal, accounting, or security obligations. School data is retained per our agreement
          with the school.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink-900">9. Security</h2>
        <p>
          We use encryption in transit, access controls, row-level security on our database,
          and reputable infrastructure providers to protect your information. No method of
          transmission or storage is completely secure, but we work to protect your data and to
          promptly address issues.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink-900">10. International transfers</h2>
        <p>
          We and our service providers may process data in countries other than yours,
          including the United States. Where required, we use appropriate safeguards (such as
          Standard Contractual Clauses) for these transfers.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink-900">11. Cookies and similar technologies</h2>
        <p>
          We use strictly necessary cookies and local storage to keep you signed in and remember
          preferences, and limited analytics to understand and improve usage. We do not use
          advertising cookies.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink-900">12. Changes to this Policy</h2>
        <p>
          We may update this Policy. We will update the “Last updated” date and, for material
          changes, provide a more prominent notice. Continued use after changes take effect
          means you accept the updated Policy.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink-900">13. Contact us</h2>
        <p>
          Questions or requests: <a href="mailto:privacy@learnnoelia.com" className="text-brand-600 underline">privacy@learnnoelia.com</a>.
          If your data is managed by your school, contact your school’s administrator, who can
          reach us on your behalf.
        </p>
      </section>

      <p className="text-xs text-ink-400">
        See also our <Link href="/legal/terms" className="underline">Terms of Service</Link>.
      </p>
    </article>
  );
}
