// Header controls for starting a new session and switching to a saved one.

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  deleteSession,
  listSessions,
  renameSession,
  type SessionListItem,
} from "./api";

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

  return { sessions, setSessions, error };
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
  onDeleted,
}: {
  currentId: string | null;
  onLoad: (id: string) => void | Promise<void>;
  /** Called after a session is deleted on the server. */
  onDeleted?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { sessions, setSessions, error } = useSessionList(open);
  const [actionError, setActionError] = useState<string | null>(null);
  useDismiss(open, popoverRef, setOpen);

  async function handleRename(id: string, title: string) {
    setActionError(null);
    try {
      await renameSession(id, title);
      setSessions((prev) =>
        prev?.map((s) => (s.id === id ? { ...s, title } : s)) ?? prev,
      );
    } catch {
      setActionError("Couldn't rename that session. Please try again.");
    }
  }

  async function handleDelete(id: string) {
    setActionError(null);
    try {
      await deleteSession(id);
      setSessions((prev) => prev?.filter((s) => s.id !== id) ?? prev);
      onDeleted?.(id);
    } catch {
      setActionError("Couldn't delete that session. Please try again.");
    }
  }

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
        <div className="absolute top-full right-0 z-50 mt-2 w-96 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg">
          <div className="border-b border-stone-200 px-4 py-2.5 text-sm font-medium tracking-wide text-stone-500 uppercase">
            Saved sessions
          </div>
          {actionError && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-stone-800">
              {actionError}
            </div>
          )}
          <div className="max-h-[28rem] overflow-y-auto">
            {sessions === null && !error && (
              <div className="px-4 py-5 text-base text-stone-400">Loading…</div>
            )}
            {error && (
              <div className="px-4 py-5 text-base text-red-700">
                Could not load: {error}
              </div>
            )}
            {sessions !== null && sessions.length === 0 && (
              <div className="px-4 py-5 text-base text-stone-400">
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
                onRename={(title) => handleRename(s.id, title)}
                onDelete={() => handleDelete(s.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type RowMode = "view" | "menu" | "rename" | "confirm-delete";

function SessionRow({
  session,
  isCurrent,
  onSelect,
  onRename,
  onDelete,
}: {
  session: SessionListItem;
  isCurrent: boolean;
  onSelect: () => void | Promise<void>;
  onRename: (title: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [mode, setMode] = useState<RowMode>("view");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const displayTitle = session.title?.trim() || "";

  function startRename() {
    setDraft(displayTitle);
    setMode("rename");
  }

  async function commitRename() {
    const title = draft.trim();
    if (!title || title === displayTitle) {
      setMode("view");
      return;
    }
    setBusy(true);
    await onRename(title);
    setBusy(false);
    setMode("view");
  }

  async function commitDelete() {
    setBusy(true);
    await onDelete();
    setBusy(false);
  }

  const rowClass = `relative flex w-full items-center gap-2 px-4 py-2.5 text-base transition ${
    isCurrent ? "bg-amber-50/60" : ""
  }`;

  if (mode === "rename") {
    return (
      <form
        className={rowClass}
        onSubmit={(e) => {
          e.preventDefault();
          void commitRename();
        }}
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setMode("view");
          }}
          maxLength={120}
          aria-label="Session title"
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1 text-base text-stone-800 focus:border-amber-800 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-md bg-amber-800 px-2.5 py-1 text-sm font-medium text-amber-50 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setMode("view")}
          className="shrink-0 rounded-md px-2 py-1 text-sm text-stone-600 hover:text-stone-900"
        >
          Cancel
        </button>
      </form>
    );
  }

  if (mode === "confirm-delete") {
    return (
      <div className={rowClass}>
        <span className="min-w-0 flex-1 truncate text-stone-800">
          Delete{" "}
          <span className="font-medium">
            {displayTitle || "this untitled session"}
          </span>
          ?
        </span>
        <button
          type="button"
          onClick={() => void commitDelete()}
          disabled={busy}
          className="shrink-0 rounded-md bg-red-700 px-2.5 py-1 text-sm font-medium text-white disabled:opacity-50"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={() => setMode("view")}
          className="shrink-0 rounded-md px-2 py-1 text-sm text-stone-600 hover:text-stone-900"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className={`${rowClass} hover:bg-stone-50`}>
      <button
        type="button"
        onClick={() => {
          void onSelect();
        }}
        className="flex min-w-0 flex-1 items-baseline justify-between gap-3 text-left"
      >
        <span className="truncate text-stone-800">
          {displayTitle || (
            <span className="text-stone-400 italic">Untitled</span>
          )}
        </span>
        <span className="shrink-0 text-sm text-stone-400">
          {formatRelative(session.savedAt)}
        </span>
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === "menu" ? "view" : "menu")}
        aria-label="Session options"
        aria-haspopup="menu"
        aria-expanded={mode === "menu"}
        className="shrink-0 rounded-md px-1.5 py-1 text-stone-500 hover:bg-stone-200/60 hover:text-stone-800"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {mode === "menu" && (
        <div
          role="menu"
          className="absolute top-full right-3 z-10 -mt-1 w-40 overflow-hidden rounded-md border border-stone-200 bg-white text-base shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={startRename}
            className="w-full px-3 py-2 text-left text-stone-800 hover:bg-stone-50"
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => setMode("confirm-delete")}
            className="w-full px-3 py-2 text-left text-red-700 hover:bg-stone-50"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
