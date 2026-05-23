import { useEffect, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { anthropic } from "./anthropic";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { NOTES_SHEET_PROMPT } from "./notesSheetPrompt";
import { Thread } from "./Thread";
import {
  coerceNarrativeItems,
  coerceSheetItems,
  EMPTY_SHEET,
  type NarrativeSheet,
  type PoemSheet,
  type SourceSheet,
} from "./sourceSheet";

type TextPart = { type: "text"; text: string };
type ToolCallPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  argsText: string;
  result?: unknown;
  isError?: boolean;
};
type Part = TextPart | ToolCallPart;

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: Part[];
};

const TEXT_SEARCH_TOOL_NAME = "text_search";
const GET_CALENDAR_TOOL_NAME = "get_calendar";
const GET_LINKS_TOOL_NAME = "get_links";
const READ_TEXT_TOOL_NAME = "read_text";
const SHOW_TEXT_TOOL_NAME = "show_text";
const FOCUS_TEXT_TOOL_NAME = "focus_text";
const SET_PHASE_TOOL_NAME = "set_phase";
const UPDATE_NOTES_TOOL_NAME = "update_notes_sheet";
const SKIP_NOTES_TOOL_NAME = "skip_notes_sheet_update";
const UPDATE_NARRATIVE_TOOL_NAME = "update_narrative_sheet";
const UPDATE_POEM_TOOL_NAME = "update_poem_sheet";
const CLIENT_TOOL_NAMES = new Set<string>([
  TEXT_SEARCH_TOOL_NAME,
  GET_CALENDAR_TOOL_NAME,
  GET_LINKS_TOOL_NAME,
  READ_TEXT_TOOL_NAME,
  SHOW_TEXT_TOOL_NAME,
  FOCUS_TEXT_TOOL_NAME,
  SET_PHASE_TOOL_NAME,
  UPDATE_NOTES_TOOL_NAME,
  SKIP_NOTES_TOOL_NAME,
  UPDATE_NARRATIVE_TOOL_NAME,
  UPDATE_POEM_TOOL_NAME,
]);
const CLIENT_TOOL_RESULTS: Record<string, string> = {
  [SHOW_TEXT_TOOL_NAME]: "rendered",
  [FOCUS_TEXT_TOOL_NAME]: "citation pinned to source sheet",
  [SET_PHASE_TOOL_NAME]: "phase updated",
  [UPDATE_NOTES_TOOL_NAME]: "notes sheet updated",
  [SKIP_NOTES_TOOL_NAME]: "notes sheet unchanged",
  [UPDATE_NARRATIVE_TOOL_NAME]: "narrative sheet updated",
  [UPDATE_POEM_TOOL_NAME]: "poem sheet updated",
};

const GET_LINKS_TOOL = {
  name: GET_LINKS_TOOL_NAME,
  description:
    "Look up Sefaria connections/links for a reference. Returns a categorized summary (Commentary, Targum, Midrash, Talmud, etc.) with per-book counts so you can see what's available without pulling every link. Useful in Phase 3 — given the focal text, find commentaries, parallels, and related sources to consider as additional texts. Each entry looks like `{ category, count, books: { 'Rashi on Genesis': 12, 'Ramban on Genesis': 5, ... } }`. Pick specific refs from the result and use `text_search` / `read_text` / `show_text` to dig in.",
  input_schema: {
    type: "object" as const,
    properties: {
      reference: {
        type: "string",
        description:
          "Sefaria reference to look up connections for, e.g. 'Genesis 22:1', 'Berakhot 57b:11'.",
      },
    },
    required: ["reference"],
  },
};

const SET_PHASE_TOOL = {
  name: SET_PHASE_TOOL_NAME,
  description:
    "Update the progress indicator shown between the chat and source-sheet panels. Call this at the START of each new phase transition. Phases: 1=Find Starting Text, 2=Surface Question, 3=Find Additional Texts, 4=Grapple With Texts Together, 5=Articulate the Chidush, 6=Polish the Source Sheet. Phase 1 is the default — only call set_phase(1) if you've explicitly regressed. Otherwise call set_phase(N) the moment you decide the learner is moving into phase N. Idempotent.",
  input_schema: {
    type: "object" as const,
    properties: {
      phase: {
        type: "integer",
        description: "Phase number, 1 through 6.",
      },
    },
    required: ["phase"],
  },
};

const FOCUS_TEXT_TOOL = {
  name: FOCUS_TEXT_TOOL_NAME,
  description:
    "Pin a text to the source sheet as a citation AND load the text into your context. Call this the MOMENT the learner identifies a text they want to focus on (e.g. 'let's go with X', 'option 2', 'this one', 'the daf'). This must be your FIRST tool call when a focus is picked, before any other tool or prose response. The tool result contains the actual text content (English) so you can engage with it concretely. Idempotent on the source sheet — if the citation is already there, no duplicate is added. Does NOT render anything in the chat (use `show_text` for that).",
  input_schema: {
    type: "object" as const,
    properties: {
      reference: {
        type: "string",
        description:
          "Sefaria reference for the chosen focal text, e.g. 'Berakhot 57b:11', 'Genesis 22:1-19'.",
      },
    },
    required: ["reference"],
  },
};

const READ_TEXT_TOOL = {
  name: READ_TEXT_TOOL_NAME,
  description:
    "Fetch the actual text of a Sefaria reference INTO YOUR CONTEXT. Use this when you need to know what a text actually says so you can orient the learner or recommend smaller sections — for example, after `get_calendar` returns a parsha-sized ref that's too big to show all at once. This does NOT render anything to the learner. To display a text to the learner, use `show_text`.",
  input_schema: {
    type: "object" as const,
    properties: {
      reference: {
        type: "string",
        description:
          "Sefaria reference, e.g. 'Deuteronomy 14:22-16:17', 'Genesis 1', 'Berakhot 5a:3'.",
      },
    },
    required: ["reference"],
  },
};

const GET_CALENDAR_TOOL = {
  name: GET_CALENDAR_TOOL_NAME,
  description:
    "Retrieve today's Jewish learning calendar from Sefaria. Returns a list of items like Parashat Hashavua, Haftarah, Daf Yomi, Daily Mishnah, Daily Rambam, Halakhah Yomit, Tanya Yomi, Yerushalmi Yomi, 929, etc. — each with a title and a Sefaria reference. Use the returned references with `show_text` to display the text. Holiday substitutions (e.g. showing Shavuot II's reading instead of the weekly parsha) are handled server-side.",
  input_schema: {
    type: "object" as const,
    properties: {},
  },
};

const TEXT_SEARCH_TOOL = {
  name: TEXT_SEARCH_TOOL_NAME,
  description:
    "Search Sefaria's library for passages matching a query. Returns a list of references with snippets. Hebrew/Aramaic terms tend to yield better matches than English translations because the search uses Hebrew root-word (lemma) matching. If a query returns nothing, try fewer or more general terms.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description:
          "Search terms. Hebrew/Aramaic preferred for reliability; English also supported.",
      },
      size: {
        type: "integer",
        description: "Maximum number of results to return. Default 10.",
      },
      filters: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional category paths to limit scope (e.g. ['Tanakh'], ['Talmud/Bavli'], ['Halakhah/Mishneh Torah']). Omit for an unscoped search.",
      },
    },
    required: ["query"],
  },
};

const SHOW_TEXT_TOOL = {
  name: SHOW_TEXT_TOOL_NAME,
  description:
    "Display a Sefaria text to the learner. The UI fetches and renders the text from Sefaria's API using the reference you provide. This is purely a UI directive — you will not see the text content.",
  input_schema: {
    type: "object" as const,
    properties: {
      reference: {
        type: "string",
        description:
          "Sefaria citation reference, e.g. 'Genesis 1:1', 'Berakhot 5a:3', 'Mishneh Torah, Tefillin 1:1'.",
      },
    },
    required: ["reference"],
  },
};

const UPDATE_NOTES_SHEET_TOOL = {
  name: UPDATE_NOTES_TOOL_NAME,
  description:
    "Apply a new full state for the notes sheet (full rewrite of title + items). See the Notes Sheet Maintenance section of the system prompt for when/how to use this. You MUST call this OR `skip_notes_sheet_update` exactly once per turn.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description:
          "Optional sheet title (2–6 words, learner's framing). Omit if not yet known. If previously set and you still want it, include it again — this is a full rewrite.",
      },
      items: {
        type: "array",
        description:
          "Ordered items, top to bottom. Preserve existing citations (type='citation') in order; add/edit/reorder notes (type='notes') as the conversation evolves.",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["citation", "notes"] },
            reference: {
              type: "string",
              description:
                "Sefaria reference (required when type='citation'). Preserve existing citations verbatim — they are managed by `focus_text`.",
            },
            heading: {
              type: "string",
              description:
                "Section heading (required when type='notes'). E.g. 'Questions', 'Themes', 'Tensions', 'Ideas', 'Observations', 'Resolutions'.",
            },
            bullets: { type: "array", items: { type: "string" } },
            paragraphs: { type: "array", items: { type: "string" } },
          },
          required: ["type"],
        },
      },
    },
    required: ["items"],
  },
};

const SKIP_NOTES_SHEET_UPDATE_TOOL = {
  name: SKIP_NOTES_TOOL_NAME,
  description:
    "Declare that the notes sheet does not need to change this turn. Use only when the learner's message added no new substantive content (pure clarification, bare procedural reply, or pure repetition of what's already on the sheet). You MUST call this OR `update_notes_sheet` exactly once per turn.",
  input_schema: {
    type: "object" as const,
    properties: {
      reason: {
        type: "string",
        description:
          "Brief reason: which exclusion applies (clarification, procedural, nothing new).",
      },
    },
    required: ["reason"],
  },
};

const UPDATE_NARRATIVE_SHEET_TOOL = {
  name: UPDATE_NARRATIVE_TOOL_NAME,
  description:
    "Draft (or revise) the NARRATIVE source sheet — the finished, polished version of the work that gets shown to the learner IN PLACE OF the running notes sheet, with a toggle to switch between them. Call this in Phase 6 once the learner has articulated their chidush and you have offered to capture the work. Provide the FULL state (title + items); this is a full rewrite, not a diff. The narrative sheet is built from ordered items that are either citation blocks (which render the full Sefaria text) or prose blocks (markdown narrative in the learner's voice). Do NOT call this until the learner is in Phase 6 and the chidush has crystallized.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description:
          "Title for the narrative sheet (2–6 words). Often the same as, or a polished version of, the notes-sheet title. In the learner's voice.",
      },
      items: {
        type: "array",
        description:
          "Ordered narrative items, top to bottom. Typical structure: a brief intro prose item (what question brought us here, what texts we looked at) → first citation → prose reflecting on what the learner saw in it → next citation → prose connecting it to the first → ... → a final prose item titled 'The Chidush' stating the learner's insight in 3–6 sentences.",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["citation", "prose"],
              description:
                "'citation' inserts a full Sefaria text block at this position. 'prose' renders a block of markdown narrative.",
            },
            reference: {
              type: "string",
              description:
                "Sefaria reference (required when type='citation'), e.g. 'Genesis 1:1', 'Berakhot 5a:3'.",
            },
            markdown: {
              type: "string",
              description:
                "Markdown narrative content (required when type='prose'). Use paragraphs, **bold**, *italic*, headings (### for sub-sections like 'The Chidush'), and lists as needed. Write in the LEARNER'S voice — preserve their phrasings; do not substitute your vocabulary for theirs.",
            },
          },
          required: ["type"],
        },
      },
    },
    required: ["items"],
  },
};

const UPDATE_POEM_SHEET_TOOL = {
  name: UPDATE_POEM_TOOL_NAME,
  description:
    "Draft (or revise) the POEM version of the narrative sheet — a short poetic distillation of the chidush, available as a third view on the source-sheet toggle (alongside Narrative and Notes). Call this ONLY in Phase 6, AFTER the narrative sheet has been drafted and the learner is happy with it. Provide the FULL state (title + markdown); this is a full rewrite, not a diff. Stay in the learner's voice — use their phrases. The poem is short (typically 8–20 lines), distills the chidush into verse. The UI does NOT automatically switch to the poem view when you call this — Narrative remains the default; the learner can toggle to Poem to see it.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description:
          "Title for the poem (2–6 words). Often the same as the narrative title or a more evocative variant.",
      },
      markdown: {
        type: "string",
        description:
          "The poem itself as markdown. Use line breaks (two spaces + newline, or blank lines between stanzas) to control structure. Italics and bold allowed; avoid headings and lists — this is verse, not prose. Keep it short and resonant; stay in the learner's voice and language.",
      },
    },
    required: ["markdown"],
  },
};

type TextSearchHit = {
  ref?: string;
  categories?: string[];
  text_snippet?: string;
};

type CalendarItem = {
  title?: string;
  ref?: string;
  display?: string;
};

async function executeReadText(args: { reference: string }): Promise<{
  ref?: string;
  heRef?: string;
  category?: string;
  versionTitle?: string;
  text: unknown;
}> {
  const ref = args.reference;
  if (!ref || typeof ref !== "string") throw new Error("missing reference");
  const url = `/sefaria-api/v3/texts/${encodeURIComponent(ref)}?version=english`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`v3/texts ${resp.status}`);
  const data = await resp.json();
  const version = (data?.versions?.[0] ?? {}) as Record<string, unknown>;
  return {
    ref: data?.ref,
    heRef: data?.heRef,
    category: data?.primary_category,
    versionTitle: version.versionTitle as string | undefined,
    text: version.text,
  };
}

type LinkCategorySummary = {
  category?: string;
  count?: number;
  books?: Record<string, number>;
};

async function executeGetLinks(args: {
  reference: string;
}): Promise<LinkCategorySummary[]> {
  const ref = args.reference;
  if (!ref || typeof ref !== "string") throw new Error("missing reference");
  const resp = await fetch(
    `/sefaria-api/link-summary/${encodeURIComponent(ref)}`,
  );
  if (!resp.ok) throw new Error(`link-summary ${resp.status}`);
  const data = await resp.json();
  const items = Array.isArray(data) ? data : [];
  return items.map((it) => {
    const obj = it as Record<string, unknown>;
    return {
      category: obj.name as string | undefined,
      count: typeof obj.count === "number" ? obj.count : undefined,
      books: (obj.books ?? undefined) as Record<string, number> | undefined,
    };
  });
}

async function executeGetCalendar(): Promise<{
  date?: string;
  items: CalendarItem[];
}> {
  const resp = await fetch("/sefaria-api/calendars");
  if (!resp.ok) throw new Error(`calendars ${resp.status}`);
  const data = await resp.json();
  const rawItems: Array<Record<string, unknown>> = data?.calendar_items ?? [];
  const items: CalendarItem[] = rawItems.map((it) => {
    const title = it.title as { en?: string } | undefined;
    const display = it.displayValue as { en?: string } | undefined;
    return {
      title: title?.en,
      ref: typeof it.ref === "string" ? it.ref : undefined,
      display: display?.en,
    };
  });
  return { date: data?.date, items };
}

async function executeTextSearch(args: {
  query: string;
  size?: number;
  filters?: string[];
}): Promise<TextSearchHit[]> {
  const { query } = args;
  const size = typeof args.size === "number" && args.size > 0 ? args.size : 10;
  const filters = Array.isArray(args.filters) ? args.filters : [];

  async function call(activeFilters: string[]) {
    const payload = {
      aggs: [],
      field: "naive_lemmatizer",
      filter_fields: activeFilters.map(() => null),
      filters: activeFilters,
      query,
      size,
      slop: 10,
      sort_fields: ["pagesheetrank"],
      sort_method: "score",
      sort_reverse: false,
      sort_score_missing: 0.04,
      source_proj: true,
      type: "text",
    };
    const resp = await fetch("/sefaria-api/search-wrapper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`search-wrapper ${resp.status}`);
    return resp.json();
  }

  let data = await call(filters);
  let hits: Array<Record<string, unknown>> = data?.hits?.hits ?? [];
  if (hits.length === 0 && filters.length > 0) {
    data = await call([]);
    hits = data?.hits?.hits ?? [];
  }
  return hits.map((h) => {
    const source = (h._source ?? {}) as Record<string, unknown>;
    const highlight = (h.highlight ?? {}) as Record<string, unknown>;
    const lemma = highlight.naive_lemmatizer as string[] | undefined;
    const raw = source.naive_lemmatizer as string | undefined;
    return {
      ref: source.ref as string | undefined,
      categories: source.categories as string[] | undefined,
      text_snippet: lemma?.[0] ?? (raw ? raw.slice(0, 280) : undefined),
    };
  });
}

function assistantPartsToApiMessages(parts: Part[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  let buffer: Array<Record<string, unknown>> = [];
  let pendingToolResults: Array<Record<string, unknown>> = [];

  const flushAssistant = () => {
    if (buffer.length > 0) {
      out.push({ role: "assistant", content: buffer });
      buffer = [];
    }
  };
  const flushToolResults = () => {
    if (pendingToolResults.length > 0) {
      out.push({ role: "user", content: pendingToolResults });
      pendingToolResults = [];
    }
  };
  const flushBoundaryIfPending = () => {
    if (pendingToolResults.length > 0) {
      flushAssistant();
      flushToolResults();
    }
  };

  for (const p of parts) {
    if (p.type === "text") {
      flushBoundaryIfPending();
      if (p.text) buffer.push({ type: "text", text: p.text });
    } else {
      buffer.push({
        type: "tool_use",
        id: p.toolCallId,
        name: p.toolName,
        input: p.args,
      });
      const resultContent =
        p.result !== undefined
          ? typeof p.result === "string"
            ? p.result
            : JSON.stringify(p.result)
          : CLIENT_TOOL_RESULTS[p.toolName] ?? "ok";
      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: p.toolCallId,
        content: resultContent,
        ...(p.isError ? { is_error: true } : {}),
      });
    }
  }

  flushAssistant();
  flushToolResults();
  return out;
}

function userPartsToText(parts: Part[]): string {
  return parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

type SavedSession = {
  messages?: Msg[];
  sourceSheet?: SourceSheet;
  narrativeSheet?: NarrativeSheet | null;
  poemSheet?: PoemSheet | null;
  currentPhase?: number;
  savedAt?: string;
};

type SessionListItem = {
  id: string;
  title: string | null;
  savedAt: string | null;
};

function formatRelative(savedAt: string | null): string {
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

function SessionsButton({
  currentId,
  onLoad,
}: {
  currentId: string | null;
  onLoad: (id: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setSessions(null);
    setError(null);
    void (async () => {
      try {
        const resp = await fetch("/sessions");
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as { sessions?: SessionListItem[] };
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!popoverRef.current) return;
      if (e.target instanceof Node && popoverRef.current.contains(e.target))
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open saved sessions"
        title="Open saved sessions"
        className="flex h-9 w-9 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-700 shadow-sm transition hover:bg-stone-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l3 3" />
        </svg>
      </button>
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
            {sessions?.map((s) => {
              const isCurrent = s.id === currentId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={async () => {
                    setOpen(false);
                    await onLoad(s.id);
                  }}
                  className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-stone-50 ${
                    isCurrent ? "bg-amber-50/60" : ""
                  }`}
                >
                  <span className="truncate text-stone-800">
                    {s.title?.trim() ? s.title : (
                      <span className="text-stone-400 italic">
                        Untitled
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-stone-400">
                    {formatRelative(s.savedAt)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sourceSheet, setSourceSheet] = useState<SourceSheet>(EMPTY_SHEET);
  const [narrativeSheet, setNarrativeSheet] = useState<NarrativeSheet | null>(
    null,
  );
  const [poemSheet, setPoemSheet] = useState<PoemSheet | null>(null);
  const [currentPhase, setCurrentPhase] = useState<number>(1);
  const [isRunning, setIsRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const initialized = useRef(false);
  const sourceSheetRef = useRef<SourceSheet>(EMPTY_SHEET);
  const sessionIdRef = useRef<string | null>(null);
  const autosaveHandleRef = useRef<number | null>(null);

  function applySourceSheet(next: SourceSheet) {
    sourceSheetRef.current = next;
    setSourceSheet(next);
  }

  async function sendToClaude(visibleMessages: Msg[]) {
    setIsRunning(true);

    const apiMessages: Array<Record<string, unknown>> = [
      { role: "user", content: "Start" },
    ];
    for (const m of visibleMessages) {
      if (m.role === "user") {
        apiMessages.push({ role: "user", content: userPartsToText(m.content) });
      } else {
        apiMessages.push(...assistantPartsToApiMessages(m.content));
      }
    }

    const assistantId = crypto.randomUUID();
    const accumulated: Part[] = [];

    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: [] },
    ]);

    try {
      while (true) {
        const partsByIndex = new Map<number, Part>();
        let stopReason: string | null = null;

        const flush = () => {
          const turnParts = [...partsByIndex.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, p]) => ({ ...p }));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: [...accumulated, ...turnParts] }
                : m,
            ),
          );
        };

        const stream = anthropic.messages.stream({
          model: "claude-opus-4-7",
          max_tokens: 16000,
          system: [
            {
              type: "text",
              text: SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text: NOTES_SHEET_PROMPT,
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: [
            TEXT_SEARCH_TOOL,
            GET_CALENDAR_TOOL,
            GET_LINKS_TOOL,
            READ_TEXT_TOOL,
            SHOW_TEXT_TOOL,
            FOCUS_TEXT_TOOL,
            SET_PHASE_TOOL,
            UPDATE_NOTES_SHEET_TOOL,
            SKIP_NOTES_SHEET_UPDATE_TOOL,
            UPDATE_NARRATIVE_SHEET_TOOL,
            UPDATE_POEM_SHEET_TOOL,
          ],
          messages: apiMessages as never,
        });

        console.log("[stream] starting iteration");
        for await (const event of stream) {
          console.log("[stream] event", event.type, "index" in event ? event.index : "-");
          if (event.type === "message_delta") {
            stopReason = event.delta.stop_reason ?? stopReason;
          } else if (event.type === "content_block_start") {
            const block = event.content_block as {
              type: string;
              id?: string;
              name?: string;
              input?: unknown;
            };
            if (block.type === "text") {
              partsByIndex.set(event.index, { type: "text", text: "" });
            } else if (block.type === "tool_use") {
              partsByIndex.set(event.index, {
                type: "tool-call",
                toolCallId: block.id ?? crypto.randomUUID(),
                toolName: block.name ?? "",
                args:
                  block.input && typeof block.input === "object"
                    ? (block.input as Record<string, unknown>)
                    : {},
                argsText: "",
              });
            }
            flush();
          } else if (event.type === "content_block_delta") {
            const part = partsByIndex.get(event.index);
            if (!part) continue;
            if (event.delta.type === "text_delta" && part.type === "text") {
              part.text += event.delta.text;
              flush();
            } else if (
              event.delta.type === "input_json_delta" &&
              part.type === "tool-call"
            ) {
              part.argsText += event.delta.partial_json;
              try {
                part.args = JSON.parse(part.argsText);
              } catch {
                // partial JSON — keep accumulating
              }
              flush();
            }
          }
        }
        console.log("[stream] turn finished, stop_reason:", stopReason);

        const turnParts = [...partsByIndex.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, p]) => p);
        accumulated.push(...turnParts);

        const clientCalls = turnParts.filter(
          (p): p is ToolCallPart =>
            p.type === "tool-call" && CLIENT_TOOL_NAMES.has(p.toolName),
        );

        await Promise.all(
          clientCalls.map(async (call) => {
            if (call.toolName === UPDATE_NOTES_TOOL_NAME) {
              const items = coerceSheetItems(
                (call.args as { items?: unknown }).items,
              );
              const rawTitle = (call.args as { title?: unknown }).title;
              const title =
                typeof rawTitle === "string" && rawTitle.trim().length > 0
                  ? rawTitle.trim()
                  : undefined;
              applySourceSheet({ title, items });
              return;
            }
            if (call.toolName === SKIP_NOTES_TOOL_NAME) {
              const reason = (call.args as { reason?: unknown }).reason;
              console.log(
                "[notes] skip",
                typeof reason === "string" ? reason : "",
              );
              return;
            }
            if (call.toolName === UPDATE_NARRATIVE_TOOL_NAME) {
              const items = coerceNarrativeItems(
                (call.args as { items?: unknown }).items,
              );
              const rawTitle = (call.args as { title?: unknown }).title;
              const title =
                typeof rawTitle === "string" && rawTitle.trim().length > 0
                  ? rawTitle.trim()
                  : undefined;
              setNarrativeSheet({ title, items });
              setCurrentPhase((prev) => (prev < 7 ? 7 : prev));
              return;
            }
            if (call.toolName === UPDATE_POEM_TOOL_NAME) {
              const rawMarkdown = (call.args as { markdown?: unknown })
                .markdown;
              const markdown =
                typeof rawMarkdown === "string" ? rawMarkdown : "";
              const rawTitle = (call.args as { title?: unknown }).title;
              const title =
                typeof rawTitle === "string" && rawTitle.trim().length > 0
                  ? rawTitle.trim()
                  : undefined;
              setPoemSheet({ title, markdown });
              setCurrentPhase((prev) => (prev < 7 ? 7 : prev));
              return;
            }
            if (call.toolName === TEXT_SEARCH_TOOL_NAME) {
              try {
                call.result = await executeTextSearch(
                  call.args as {
                    query: string;
                    size?: number;
                    filters?: string[];
                  },
                );
              } catch (e) {
                call.result = `search error: ${
                  e instanceof Error ? e.message : String(e)
                }`;
                call.isError = true;
              }
              return;
            }
            if (call.toolName === GET_CALENDAR_TOOL_NAME) {
              try {
                call.result = await executeGetCalendar();
              } catch (e) {
                call.result = `calendar error: ${
                  e instanceof Error ? e.message : String(e)
                }`;
                call.isError = true;
              }
              return;
            }
            if (call.toolName === GET_LINKS_TOOL_NAME) {
              try {
                call.result = await executeGetLinks(
                  call.args as { reference: string },
                );
              } catch (e) {
                call.result = `get_links error: ${
                  e instanceof Error ? e.message : String(e)
                }`;
                call.isError = true;
              }
              return;
            }
            if (call.toolName === READ_TEXT_TOOL_NAME) {
              try {
                call.result = await executeReadText(
                  call.args as { reference: string },
                );
              } catch (e) {
                call.result = `read_text error: ${
                  e instanceof Error ? e.message : String(e)
                }`;
                call.isError = true;
              }
              return;
            }
            if (call.toolName === FOCUS_TEXT_TOOL_NAME) {
              const ref = (call.args as { reference?: unknown }).reference;
              if (typeof ref !== "string" || ref.trim().length === 0) {
                call.result = "focus_text error: missing reference";
                call.isError = true;
                return;
              }
              const reference = ref.trim();
              const prev = sourceSheetRef.current;
              const present = prev.items.some(
                (it) => it.type === "citation" && it.reference === reference,
              );
              if (!present) {
                applySourceSheet({
                  ...prev,
                  items: [...prev.items, { type: "citation", reference }],
                });
              }
              setCurrentPhase((prev) => (prev < 2 ? 2 : prev));
              try {
                call.result = await executeReadText({ reference });
              } catch (e) {
                call.result = {
                  pinned: true,
                  read_error:
                    e instanceof Error ? e.message : String(e),
                };
              }
              return;
            }
            if (call.toolName === SET_PHASE_TOOL_NAME) {
              const raw = (call.args as { phase?: unknown }).phase;
              const n = typeof raw === "number" ? raw : Number(raw);
              if (Number.isFinite(n)) {
                const clamped = Math.min(6, Math.max(1, Math.round(n)));
                setCurrentPhase(clamped);
              }
            }
          }),
        );

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: accumulated.map((p) => ({ ...p })) }
              : m,
          ),
        );

        if (stopReason !== "tool_use" || clientCalls.length === 0) {
          break;
        }

        apiMessages.push(...assistantPartsToApiMessages(turnParts));
      }
    } catch (err) {
      console.error("[stream] error", err);
      const message = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: [{ type: "text", text: `Error: ${message}` }] }
            : m,
        ),
      );
    } finally {
      console.log("[stream] finally — setIsRunning(false)");
      setIsRunning(false);
    }
  }

  async function onNew(message: AppendMessage) {
    if (message.role !== "user") return;
    const userMessage: Msg = {
      id: crypto.randomUUID(),
      role: "user",
      content: message.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => ({ type: "text", text: c.text })),
    };
    const next = [...messages, userMessage];
    setMessages(next);
    await sendToClaude(next);
  }

  const runtime = useExternalStoreRuntime({
    isRunning,
    messages,
    convertMessage: (m): ThreadMessageLike => ({
      id: m.id,
      role: m.role,
      content: m.content as ThreadMessageLike["content"],
    }),
    onNew,
  });

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const newId = crypto.randomUUID();
    sessionIdRef.current = newId;
    setLoaded(true);
    console.log("[session] new", newId);
    void sendToClaude([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const id = sessionIdRef.current;
    if (!id) return;
    // Don't write a session file until the user has actually said something.
    const hasUserMessage = messages.some((m) => m.role === "user");
    if (!hasUserMessage) return;
    if (autosaveHandleRef.current !== null) {
      window.clearTimeout(autosaveHandleRef.current);
    }
    autosaveHandleRef.current = window.setTimeout(() => {
      autosaveHandleRef.current = null;
      void fetch(`/sessions/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          sourceSheet,
          narrativeSheet,
          poemSheet,
          currentPhase,
          savedAt: new Date().toISOString(),
        } satisfies SavedSession),
      }).catch((e) => console.warn("[autosave] failed", e));
    }, 500);
    return () => {
      if (autosaveHandleRef.current !== null) {
        window.clearTimeout(autosaveHandleRef.current);
        autosaveHandleRef.current = null;
      }
    };
  }, [loaded, messages, sourceSheet, narrativeSheet, poemSheet, currentPhase]);

  async function loadSession(targetId: string) {
    if (autosaveHandleRef.current !== null) {
      window.clearTimeout(autosaveHandleRef.current);
      autosaveHandleRef.current = null;
    }
    const oldId = sessionIdRef.current;
    if (oldId && oldId !== targetId && messages.some((m) => m.role === "user")) {
      try {
        await fetch(`/sessions/${encodeURIComponent(oldId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            sourceSheet,
            narrativeSheet,
            poemSheet,
            currentPhase,
            savedAt: new Date().toISOString(),
          } satisfies SavedSession),
        });
      } catch (e) {
        console.warn("[load] flush failed", e);
      }
    }
    try {
      const resp = await fetch(`/sessions/${encodeURIComponent(targetId)}`);
      if (!resp.ok) throw new Error(`load ${resp.status}`);
      const data = (await resp.json()) as SavedSession;
      sessionIdRef.current = targetId;
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      if (data.sourceSheet && Array.isArray(data.sourceSheet.items)) {
        applySourceSheet(data.sourceSheet);
      } else {
        applySourceSheet(EMPTY_SHEET);
      }
      setNarrativeSheet(data.narrativeSheet ?? null);
      setPoemSheet(data.poemSheet ?? null);
      setCurrentPhase(
        typeof data.currentPhase === "number" ? data.currentPhase : 1,
      );
      console.log("[session] loaded", targetId);
    } catch (e) {
      console.warn("[load] failed", e);
    }
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread
        sheet={sourceSheet}
        narrative={narrativeSheet}
        poem={poemSheet}
        phase={currentPhase}
        headerRight={
          <SessionsButton
            currentId={sessionIdRef.current}
            onLoad={loadSession}
          />
        }
      />
    </AssistantRuntimeProvider>
  );
}
