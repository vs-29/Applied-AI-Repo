import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export const metadata = { title: "Sign in — Notebook RAG" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string };
}) {
  // Keep only the path of the return URL, never its host, so sign-in can't be
  // used to redirect someone to another site.
  let target = "/";
  try {
    const url = new URL(searchParams.callbackUrl ?? "/", "http://local");
    target = url.pathname + url.search;
  } catch {
    /* keep "/" */
  }

  if ((await auth())?.user) redirect(target);

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-xl border border-hairline bg-surface p-8 text-center">
        <span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
          <span className="font-display text-lg font-bold">N</span>
        </span>
        <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
          Notebook RAG
        </h1>
        <p className="mt-2 text-sm leading-6 text-faint">
          Sign in to see your notebooks. Your sources and answers are private to
          your account.
        </p>

        {searchParams.error && (
          <p className="mt-4 rounded-lg border border-hairline bg-paper px-3 py-2 text-xs text-ink">
            Sign-in failed. Please try again.
          </p>
        )}

        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: target });
          }}
        >
          <button type="submit" className="btn-primary w-full">
            Continue with GitHub
          </button>
        </form>
      </div>
    </main>
  );
}
