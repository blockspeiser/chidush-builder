import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { signOut } from "./firebase";

/** Profile avatar that opens a small account menu. */
export function AccountMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const name = user.displayName ?? user.email ?? "Signed in";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-12 w-12 items-center justify-center rounded-md transition hover:bg-stone-200/40 ${
          open ? "bg-stone-200/40" : "bg-transparent"
        }`}
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
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-2 w-64 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg"
        >
          <div className="border-b border-stone-200 px-3 py-2">
            <div className="truncate text-sm font-medium text-stone-800">
              {user.displayName ?? "Signed in"}
            </div>
            {user.email && (
              <div className="truncate text-xs text-stone-500">{user.email}</div>
            )}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="w-full px-3 py-2 text-left text-sm text-stone-800 transition hover:bg-stone-50"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
