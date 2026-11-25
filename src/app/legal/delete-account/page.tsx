import Link from "next/link";

export const metadata = { title: "Delete your LearnNoelia account" };

export default function DeleteAccountPage() {
  return (
    <article className="mx-auto max-w-prose space-y-5 pb-10 text-sm leading-relaxed text-ink-700">
      <h1 className="text-2xl font-bold text-ink-900">Delete your LearnNoelia account</h1>
      <p>You can request deletion on the web. You do not need to install the app.</p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>Sign in with the account you want to delete.</li>
        <li>Open Settings, select <strong>Delete my account</strong>, and confirm.</li>
      </ol>
      <Link href="/settings" className="btn-primary inline-block">Open account settings</Link>
      <p>
        Deleting your account permanently removes your profile and learning history.
        Review the <Link href="/legal/privacy" className="underline">Privacy Policy</Link> for
        details on data retention, or export your data in Settings before deleting it.
      </p>
      <p>
        If you cannot sign in, email <a className="underline" href="mailto:privacy@learnnoelia.com?subject=LearnNoelia%20account%20deletion%20request">privacy@learnnoelia.com</a> to
        request deletion. Include the email address associated with your account.
        Do not send your password. If your school manages your account, contact your school.
      </p>
    </article>
  );
}
