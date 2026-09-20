// Header controls for starting a new session and switching to a saved one.

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { listSessions, type SessionListItem } from "./api";

const ICON_BUTTON_CLASS =
  "flex h-12 w-12 items-center justify-center rounded-md bg-transparent text-stone-600 transition hover:bg-stone-200/40 hover:text-stone-900";

function Tooltip({ children }: { children: ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 rounded-md bg-[#f7f1de] px-2.5 py-1 text-xs font-medium whitespace-nowrap text-stone-800 opacity-0 shadow-sm ring-1 ring-stone-300/60 transition-opacity duration-150 group-hover:opacity-100"
    >
      {children}
    </span>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function formatRelative(savedAt: string | null): string {
  if (!savedAt) return "";
  const then = new Date(savedAt).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(savedAt).toLocaleDateString();
}

export function NewSessionButton({
  onClick,
  disabled,
}: {
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => {
          void onClick();
        }}
        disabled={disabled}
        aria-label="Start a new session"
        className={`${ICON_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <Icon>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </Icon>
      </button>
      <Tooltip>New session</Tooltip>
    </div>
  );
}

/** Fetches the saved-session list each time the popover opens. */
function useSessionList(open: boolean) {
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSessions(null);
    setError(null);
    listSessions()
      .then(setSessions)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [open]);

  return { sessions, error };
}

/** Closes the popover on an outside click or Escape. */
function useDismiss(
  open: boolean,
  ref: RefObject<HTMLElement>,
  setOpen: (open: boolean) => void,
) {
  const onDismiss = () => setOpen(false);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (e.target instanceof Node && ref.current.contains(e.target)) return;
      onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ref, setOpen]);
}

export function SessionsButton({
  currentId,
  onLoad,
}: {
  currentId: string | null;
  onLoad: (id: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { sessions, error } = useSessionList(open);
  useDismiss(open, popoverRef, setOpen);

  return (
    <div ref={popoverRef} className="group relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open saved sessions"
        className={ICON_BUTTON_CLASS}
      >
        <Icon>
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </Icon>
      </button>
      {!open && <Tooltip>Open sessions</Tooltip>}
      {open && (
        <div className="absolute top-full right-0 z-50 mt-2 w-80 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg">
          <div className="border-b border-stone-200 px-3 py-2 text-xs font-medium tracking-wide text-stone-500 uppercase">
            Saved sessions
          </div>
          <div className="max-h-96 overflow-y-auto">
            {sessions === null && !error && (
              <div className="px-3 py-4 text-sm text-stone-400">Loading…</div>
            )}
            {error && (
              <div className="px-3 py-4 text-sm text-red-700">
                Could not load: {error}
              </div>
            )}
            {sessions !== null && sessions.length === 0 && (
              <div className="px-3 py-4 text-sm text-stone-400">
                No saved sessions yet.
              </div>
            )}
            {sessions?.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                isCurrent={s.id === currentId}
                onSelect={async () => {
                  setOpen(false);
                  await onLoad(s.id);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session,
  isCurrent,
  onSelect,
}: {
  session: SessionListItem;
  isCurrent: boolean;
  onSelect: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void onSelect();
      }}
      className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-stone-50 ${
        isCurrent ? "bg-amber-50/60" : ""
      }`}
    >
      <span className="truncate text-stone-800">
        {session.title?.trim() ? (
          session.title
        ) : (
          <span className="text-stone-400 italic">Untitled</span>
        )}
      </span>
      <span className="shrink-0 text-xs text-stone-400">
        {formatRelative(session.savedAt)}
      </span>
    </button>
  );
}
