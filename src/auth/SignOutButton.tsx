import type { User } from "firebase/auth";
import { signOut } from "./firebase";

export function SignOutButton({ user }: { user: User }) {
  const label = user.displayName ?? user.email ?? "Signed in";
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => void signOut()}
        aria-label={`Sign out ${label}`}
        className="flex h-12 w-12 items-center justify-center rounded-md bg-transparent transition hover:bg-stone-200/40"
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt=""
            referrerPolicy="no-referrer"
            className="h-7 w-7 rounded-full ring-1 ring-stone-300/60"
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-300 text-xs font-medium text-stone-800">
            {label.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full right-0 z-50 mt-1.5 rounded-md bg-[#f7f1de] px-2.5 py-1 text-xs font-medium whitespace-nowrap text-stone-800 opacity-0 shadow-sm ring-1 ring-stone-300/60 transition-opacity duration-150 group-hover:opacity-100"
      >
        Sign out ({label})
      </span>
    </div>
  );
}
