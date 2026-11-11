"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { deleteAccount } from "@/app/settings/actions";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await supabaseBrowser().auth.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      data-testid="sign-out"
      className="btn-ghost w-full"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

export function DeleteAccountButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
      >
        Delete my account
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-red-200 p-3 dark:border-red-500/30">
      <p className="text-sm text-red-700 dark:text-red-400">
        This permanently deletes your account, progress, and submissions. There is no undo.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                setError(null);
                await deleteAccount();
                router.replace("/");
                router.refresh();
              } catch (e: any) { setError(e?.message ?? "Failed"); }
            })
          }
          className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700"
        >
          {pending ? "Deleting…" : "Yes, delete everything"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="btn-ghost flex-1">
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
