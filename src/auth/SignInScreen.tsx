import { useState } from "react";
import { signInWithGoogle } from "./firebase";

export function SignInScreen() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fbf8ef] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-[#f7f1de] px-8 py-10 text-center shadow-sm ring-1 ring-stone-300/60">
        <div className="font-serif text-3xl text-[#8a4b1f]">Chidush Builder</div>
        <p className="mt-2 text-sm text-stone-600">
          Guided learning, creative outcomes
        </p>
        <button
          type="button"
          onClick={() => void handleSignIn()}
          disabled={busy}
          className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-md bg-white px-4 py-2.5 text-sm font-medium text-stone-800 ring-1 ring-stone-300 transition hover:bg-stone-50 disabled:opacity-50"
        >
          <GoogleMark />
          {busy ? "Signing in…" : "Continue with Google"}
        </button>
        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
        <p className="mt-6 text-xs text-stone-500">
          Sign-in is required so we can keep your sessions and share the cost
          of the assistant fairly.
        </p>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4H24v8.1h12.8c-.3 2.1-1.7 5.3-4.8 7.4l7.4 5.7c4.4-4.1 7.1-10.1 7.1-17.2z" />
      <path fill="#FBBC05" d="M10.4 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.8 2.4-8.5 2.4-6.3 0-11.7-4.1-13.6-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
