import { authFetch } from "./auth/authFetch";
import {
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useMessage,
  type TextContentPartComponent,
  type ToolCallContentPartComponent,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import { TextBlock } from "sefaria-ui-components";

type SefariaData = Parameters<typeof TextBlock>[0]["sefariaData"];

function useSefariaText(ref: string): {
  data: SefariaData | null;
  error: string | null;
} {
  const [data, setData] = useState<SefariaData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ref) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setData(null);
    setError(null);
    authFetch(`/api/sefaria/texts/${encodeURIComponent(ref)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`texts ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        // When sections is shallower than textDepth, the API has already scoped
        // text to the requested leaf (e.g. all sub-comments on a verse).
        // TextBlock's slicer doesn't know this and would slice by section index,
        // returning an empty array. Drop sections so it renders everything.
        const sections = (d as { sections?: unknown }).sections;
        const textDepth = (d as { textDepth?: unknown }).textDepth;
        if (
          Array.isArray(sections) &&
          typeof textDepth === "number" &&
          sections.length < textDepth
        ) {
          const fixed = { ...(d as object) } as Record<string, unknown>;
          delete fixed.sections;
          delete fixed.toSections;
          setData(fixed as SefariaData);
          return;
        }
        setData(d as SefariaData);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [ref]);

  return { data, error };
}

const SefariaTextBlock = ({ sefRef }: { sefRef: string }) => {
  const { data, error } = useSefariaText(sefRef);
  if (error) {
    return (
      <div className="my-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
        Could not load <span className="font-medium">{sefRef}</span>: {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="my-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-500">
        Loading <span className="font-medium">{sefRef}</span>…
      </div>
    );
  }
  return (
    <div style={{ zoom: 0.88 }}>
      <TextBlock sefRef={sefRef} sefariaData={data} showFollowup={false} />
    </div>
  );
};
import type {
  NarrativeSheet,
  PoemSheet,
  SourceSheet,
  SourceSheetItem,
} from "./sourceSheet";

const tokenSetForDiff = (s: string): Set<string> => {
  const normalized = s
    .toLowerCase()
    .replace(/\*\*/g, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return new Set(
    normalized
      .split(/[^a-z0-9֐-׿]+/)
      .filter((t) => t.length > 2),
  );
};

const flashAnimation = (el: Element) => {
  (el as HTMLElement).animate(
    [
      { backgroundColor: "oklch(0.9 0.07 240 / 0.7)" },
      { backgroundColor: "transparent" },
    ],
    { duration: 3000, easing: "ease-out", fill: "forwards" },
  );
};

// Smart scroll-into-view for the source-sheet panel.
// Default: center the element in the scroll container.
// If the element is taller than the container: align its top with the container top.
const smartScrollIntoView = (
  el: HTMLElement,
  scrollContainer: HTMLElement,
  label?: string,
) => {
  const containerRect = scrollContainer.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const containerHeight = scrollContainer.clientHeight;
  const elHeight = elRect.height;
  const elTopInContent =
    elRect.top - containerRect.top + scrollContainer.scrollTop;

  let target: number;
  if (elHeight >= containerHeight) {
    target = elTopInContent;
  } else {
    target = elTopInContent - (containerHeight - elHeight) / 2;
  }
  const max = scrollContainer.scrollHeight - containerHeight;
  target = Math.max(0, Math.min(max, target));

  console.log("[smartScrollIntoView]", {
    label,
    elHeight,
    containerHeight,
    elTopInContent,
    target,
    currentScroll: scrollContainer.scrollTop,
  });

  scrollContainer.scrollTo({ top: target, behavior: "smooth" });
};

const inlineMarkdownComponents = {
  p: ({ children }: ComponentPropsWithoutRef<"p">) => <>{children}</>,
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-stone-900" {...props} />
  ),
  em: (props: ComponentPropsWithoutRef<"em">) => (
    <em className="italic" {...props} />
  ),
  code: (props: ComponentPropsWithoutRef<"code">) => (
    <code
      className="rounded bg-stone-100 px-1 py-0.5 font-mono text-base"
      {...props}
    />
  ),
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a className="text-amber-700 underline" {...props} />
  ),
};

const markdownComponents = {
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p className="my-2 first:mt-0 last:mb-0" {...props} />
  ),
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-stone-900" {...props} />
  ),
  em: (props: ComponentPropsWithoutRef<"em">) => (
    <em className="italic" {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul className="my-2 list-disc space-y-1 pl-6" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol className="my-2 list-decimal space-y-1 pl-6" {...props} />
  ),
  li: (props: ComponentPropsWithoutRef<"li">) => <li {...props} />,
  h1: (props: ComponentPropsWithoutRef<"h1">) => (
    <h1 className="mt-3 mb-2 text-2xl font-semibold text-stone-800" {...props} />
  ),
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="mt-3 mb-2 text-xl font-semibold text-stone-800" {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="mt-2 mb-1 text-lg font-semibold text-stone-800" {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="my-2 border-l-2 border-stone-300 pl-3 text-stone-700 italic"
      {...props}
    />
  ),
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a className="text-amber-700 underline" {...props} />
  ),
  code: (props: ComponentPropsWithoutRef<"code">) => (
    <code
      className="rounded bg-stone-100 px-1 py-0.5 font-mono text-base"
      {...props}
    />
  ),
};

const TextPart: TextContentPartComponent = () => (
  <MarkdownTextPrimitive components={markdownComponents} />
);

const ShowTextToolPart: ToolCallContentPartComponent = ({ args, toolName }) => {
  console.log("[ShowTextToolPart]", { toolName, args });
  const reference =
    typeof (args as { reference?: unknown })?.reference === "string"
      ? (args as { reference: string }).reference
      : "";

  if (!reference) {
    return (
      <div className="my-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-500">
        Loading text…
      </div>
    );
  }

  return (
    <div className="mt-3 mb-[42px]">
      <SefariaTextBlock sefRef={reference} />
    </div>
  );
};

const TextSearchToolPart: ToolCallContentPartComponent = ({ toolCallId }) => {
  const content = useMessage((s) => s.content);
  const searches = content.flatMap((p) => {
    if (p.type !== "tool-call" || p.toolName !== "text_search") return [];
    const query =
      typeof (p.args as { query?: unknown })?.query === "string"
        ? ((p.args as { query: string }).query)
        : "";
    return [
      {
        toolCallId: p.toolCallId,
        query,
        done: p.result !== undefined,
        resultCount: Array.isArray(p.result) ? p.result.length : 0,
      },
    ];
  });

  if (searches.length === 0 || searches[0].toolCallId !== toolCallId) {
    return null;
  }

  const pending = searches.filter((s) => !s.done);
  if (pending.length > 0) {
    const queries = pending.map((s) => s.query).filter(Boolean).join(", ");
    return (
      <div
        dir="ltr"
        className="my-3 flex items-center gap-3 text-base text-stone-500"
      >
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600" />
        <span>
          Searching
          {queries ? (
            <>
              :{" "}
              <bdi style={{ unicodeBidi: "isolate" }}>{queries}</bdi>
            </>
          ) : (
            "…"
          )}
        </span>
      </div>
    );
  }

  const total = searches.reduce((sum, s) => sum + s.resultCount, 0);
  return (
    <div dir="ltr" className="my-3 text-base text-stone-500">
      Found {total} source{total === 1 ? "" : "s"}.
    </div>
  );
};

const HiddenToolPart: ToolCallContentPartComponent = () => null;
const HiddenReasoningPart = () => null;

const UserMessage = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  return (
    <div ref={rootRef}>
      <MessagePrimitive.Root className="grid grid-cols-[1fr_auto] gap-x-3 py-3">
        <div className="col-start-2 max-w-[80ch] rounded-2xl bg-[#f7f1de] px-4 py-2 text-stone-900">
          <MessagePrimitive.Parts components={{ Text: TextPart }} />
        </div>
      </MessagePrimitive.Root>
    </div>
  );
};

const findScrollableAncestor = (el: HTMLElement): HTMLElement | null => {
  let current: HTMLElement | null = el.parentElement;
  while (current) {
    const overflow = getComputedStyle(current).overflowY;
    if (overflow === "auto" || overflow === "scroll") return current;
    current = current.parentElement;
  }
  return null;
};

/**
 * Shown while the model is working but nothing visible is streaming yet:
 * before the first block (Opus 5 thinks before it writes) and between a
 * tool call and the text that follows it.
 */
const ThinkingIndicator = () => {
  const isRunning = useMessage((s) => s.status?.type === "running");
  const streamingText = useMessage((s) => {
    const last = s.content[s.content.length - 1];
    return last?.type === "text" && last.text.length > 0;
  });
  if (!isRunning || streamingText) return null;
  return (
    <div
      className="flex h-6 items-center gap-1.5 px-1"
      role="status"
      aria-label="Thinking"
    >
      <span className="thinking-dot" style={{ animationDelay: "0s" }} />
      <span className="thinking-dot" style={{ animationDelay: "0.15s" }} />
      <span className="thinking-dot" style={{ animationDelay: "0.3s" }} />
    </div>
  );
};

const AssistantMessage = () => {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const scrollEl = findScrollableAncestor(el);
    if (!scrollEl) return;

    let frozen = false;
    const observer = new ResizeObserver(() => {
      if (frozen) return;
      const scrollRect = scrollEl.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const topInViewport = elRect.top - scrollRect.top;
      const stopThreshold = scrollRect.height / 3;

      if (topInViewport <= stopThreshold) {
        frozen = true;
        return;
      }

      const tailBelowViewport = elRect.bottom - scrollRect.bottom;
      if (tailBelowViewport <= 0) return;

      const maxAllowedScroll = topInViewport - stopThreshold;
      const delta = Math.min(tailBelowViewport, maxAllowedScroll);
      if (delta > 0) {
        scrollEl.scrollTop += delta;
      }
      if (delta >= maxAllowedScroll) {
        frozen = true;
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef}>
      <MessagePrimitive.Root className="grid grid-cols-[auto_1fr] gap-x-3 py-3">
        <div className="mt-1 h-8 w-8 shrink-0 rounded-full bg-amber-800 text-center text-xl font-semibold leading-8 text-amber-50">
          ח
        </div>
        <div className="max-w-[80ch] text-stone-900">
          <MessagePrimitive.Parts
            components={{
              Text: TextPart,
              Reasoning: HiddenReasoningPart,
              tools: {
                by_name: {
                  show_text: ShowTextToolPart,
                  text_search: TextSearchToolPart,
                },
                Fallback: HiddenToolPart,
              },
            }}
          />
          <ThinkingIndicator />
        </div>
      </MessagePrimitive.Root>
    </div>
  );
};

const SheetItem = ({ item }: { item: SourceSheetItem }) => {
  if (item.type === "citation") {
    return (
      <SefariaTextBlock sefRef={item.reference} />
    );
  }
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-stone-800">
        {item.heading}
      </h3>
      {item.bullets && item.bullets.length > 0 && (
        <ul className="list-disc space-y-1.5 pl-6 text-lg leading-relaxed text-stone-800">
          {item.bullets.map((b, i) => (
            <li
              key={i}
              data-bullet-idx={i}
              className="rounded -mx-1 px-1"
            >
              <ReactMarkdown components={inlineMarkdownComponents}>
                {b}
              </ReactMarkdown>
            </li>
          ))}
        </ul>
      )}
      {item.paragraphs?.map((p, i) => (
        <div
          key={i}
          data-paragraph-idx={i}
          className="rounded -mx-1 px-1 text-lg leading-relaxed text-stone-800 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        >
          <ReactMarkdown components={markdownComponents}>{p}</ReactMarkdown>
        </div>
      ))}
    </section>
  );
};

type SheetView = "narrative" | "notes" | "poem";

type PrimaryView = "narrative" | "poem";

const PencilIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4"
    aria-hidden="true"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

/**
 * Underline tabs: [Narrative|Poem ▾] · Notes. The first tab shows whichever
 * creative view was chosen most recently; its caret offers the other one.
 */
const SheetTabs = ({
  view,
  primary,
  onChange,
}: {
  view: SheetView;
  primary: PrimaryView;
  onChange: (v: SheetView) => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const alternate: PrimaryView = primary === "narrative" ? "poem" : "narrative";
  const label = (v: PrimaryView) => (v === "narrative" ? "Narrative" : "Poem");

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const tabClass = (active: boolean) =>
    `-mb-px inline-flex items-center gap-1 border-b-2 px-0 pb-2.5 text-base transition ${
      active
        ? "border-[#a3712a] font-semibold text-stone-900"
        : "border-transparent text-stone-500 hover:text-stone-800"
    }`;

  return (
    <div ref={wrapperRef} className="flex items-end gap-6">
      <button
        type="button"
        onClick={() => onChange("notes")}
        className={tabClass(view === "notes")}
      >
        Notes
      </button>
      <div className={`relative ${tabClass(view === primary)}`}>
        <button type="button" onClick={() => onChange(primary)}>
          {label(primary)}
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="More views"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="rounded p-0.5 text-stone-400 transition hover:text-stone-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 12 12"
            width="12"
            height="12"
            aria-hidden="true"
          >
            <path
              d="M3 4.5 L6 7.5 L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute top-full left-0 z-20 mt-1 min-w-[9rem] overflow-hidden rounded-md border border-stone-200 bg-white text-base font-normal shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(alternate);
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-stone-700 transition hover:bg-stone-50 hover:text-stone-900"
            >
              {label(alternate)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const NarrativeView = ({ narrative }: { narrative: NarrativeSheet }) => (
  <>
    {narrative.items.length === 0 ? (
      <div className="text-center text-lg leading-relaxed text-stone-400 italic">
        The narrative is being drafted…
      </div>
    ) : (
      narrative.items.map((item, i) =>
        item.type === "citation" ? (
          <SefariaTextBlock key={i} sefRef={item.reference} />
        ) : (
          <div
            key={i}
            className="text-lg leading-relaxed text-stone-800 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          >
            <ReactMarkdown components={markdownComponents}>
              {item.markdown}
            </ReactMarkdown>
          </div>
        ),
      )
    )}
  </>
);

const PoemView = ({ poem }: { poem: PoemSheet }) => (
  <div className="text-lg leading-relaxed whitespace-pre-line text-stone-800 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
    {poem.markdown ? (
      <ReactMarkdown components={markdownComponents}>
        {poem.markdown}
      </ReactMarkdown>
    ) : (
      <div className="text-center text-stone-400 italic">
        The poem is being drafted…
      </div>
    )}
  </div>
);

const SourceSheetPanel = ({
  sheet,
  narrative,
  poem,
  isRunning = false,
  onRewriteNarrative,
  onRewritePoem,
  drafting = null,
  view,
  onViewChange,
}: {
  sheet: SourceSheet;
  narrative: NarrativeSheet | null;
  poem: PoemSheet | null;
  isRunning?: boolean;
  onRewriteNarrative?: () => void;
  onRewritePoem?: () => void;
  drafting?: "narrative" | "poem" | null;
  view: SheetView;
  onViewChange: (v: SheetView) => void;
}) => {
  // The creative view most recently chosen keeps the first toggle slot,
  // even while Notes is selected.
  const [primary, setPrimary] = useState<PrimaryView>("narrative");
  useEffect(() => {
    if (view === "narrative" || view === "poem") setPrimary(view);
  }, [view]);
  const hasNarrative =
    narrative !== null &&
    (narrative.items.length > 0 || (narrative.title ?? "").length > 0);
  const hasNotesContent =
    sheet.items.length > 0 || (sheet.title ?? "").length > 0;
  // Nothing to switch between yet: hide the header on a fresh session.
  const isEmpty = !hasNotesContent && !hasNarrative && poem === null;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [view]);

  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const prevItemsRef = useRef<SourceSheetItem[]>([]);

  useEffect(() => {
    const prevCitations = new Set(
      prevItemsRef.current
        .filter((i): i is Extract<SourceSheetItem, { type: "citation" }> =>
          i.type === "citation",
        )
        .map((i) => i.reference),
    );

    // Pool ALL previous bullets/paragraphs across sections so a bullet
    // that moved (or whose section was renamed) is still recognized.
    const prevBulletsAll: string[] = [];
    const prevParagraphsAll: string[] = [];
    for (const item of prevItemsRef.current) {
      if (item.type === "notes") {
        prevBulletsAll.push(...(item.bullets ?? []));
        prevParagraphsAll.push(...(item.paragraphs ?? []));
      }
    }
    const prevBulletTokens = prevBulletsAll.map(tokenSetForDiff);
    const prevParagraphTokens = prevParagraphsAll.map(tokenSetForDiff);

    const isCarriedOver = (
      text: string,
      prevTexts: string[],
      prevTokens: Set<string>[],
    ): boolean => {
      if (prevTexts.includes(text)) return true;
      const tokens = tokenSetForDiff(text);
      if (tokens.size === 0) return false;
      for (const other of prevTokens) {
        if (other.size === 0) continue;
        let overlap = 0;
        for (const t of tokens) if (other.has(t)) overlap++;
        const ratio = overlap / Math.min(tokens.size, other.size);
        if (ratio >= 0.5) return true;
      }
      return false;
    };

    const newCitationIndices: number[] = [];
    type SectionChange = {
      sectionIdx: number;
      newBullets: number[];
      newParagraphs: number[];
    };
    const sectionChanges: SectionChange[] = [];

    sheet.items.forEach((item, idx) => {
      if (item.type === "citation") {
        if (!prevCitations.has(item.reference)) newCitationIndices.push(idx);
        return;
      }
      const newBullets: number[] = [];
      const newParagraphs: number[] = [];
      (item.bullets ?? []).forEach((b, i) => {
        if (!isCarriedOver(b, prevBulletsAll, prevBulletTokens)) {
          newBullets.push(i);
        }
      });
      (item.paragraphs ?? []).forEach((p, i) => {
        if (!isCarriedOver(p, prevParagraphsAll, prevParagraphTokens)) {
          newParagraphs.push(i);
        }
      });
      if (newBullets.length > 0 || newParagraphs.length > 0) {
        sectionChanges.push({ sectionIdx: idx, newBullets, newParagraphs });
      }
    });

    console.log("[SourceSheetPanel] diff", {
      view,
      itemCount: sheet.items.length,
      newCitationIndices,
      sectionChanges,
    });

    const cleanupFns: Array<() => void> = [];

    if (view === "notes") {
      const container = scrollContainerRef.current;
      // Scroll target
      if (newCitationIndices.length > 0 && container) {
        const idx = newCitationIndices[0];
        const el = itemRefs.current[idx];
        console.log("[SourceSheetPanel] scrolling to new citation", {
          idx,
          el,
          container,
        });
        if (el) {
          smartScrollIntoView(el, container, `citation #${idx}`);
          // Citations fetch their text async — re-scroll as TextBlock loads.
          const observer = new ResizeObserver(() => {
            smartScrollIntoView(el, container, `citation #${idx} (resized)`);
          });
          observer.observe(el);
          const timeout = window.setTimeout(
            () => observer.disconnect(),
            3000,
          );
          cleanupFns.push(() => {
            observer.disconnect();
            window.clearTimeout(timeout);
          });
        }
      } else if (sectionChanges.length > 0 && container) {
        const { sectionIdx, newBullets, newParagraphs } = sectionChanges[0];
        const sectionEl = itemRefs.current[sectionIdx];
        let target: HTMLElement | null = sectionEl;
        if (sectionEl && newBullets.length > 0) {
          target =
            (sectionEl.querySelector(
              `[data-bullet-idx="${newBullets[0]}"]`,
            ) as HTMLElement | null) ?? sectionEl;
        } else if (sectionEl && newParagraphs.length > 0) {
          target =
            (sectionEl.querySelector(
              `[data-paragraph-idx="${newParagraphs[0]}"]`,
            ) as HTMLElement | null) ?? sectionEl;
        }
        console.log("[SourceSheetPanel] scrolling to changed section", {
          sectionIdx,
          target,
        });
        if (target) smartScrollIntoView(target, container, `notes change`);
      }

      // Animate granular changes (citations get no flash, just the scroll)
      for (const { sectionIdx, newBullets, newParagraphs } of sectionChanges) {
        const sectionEl = itemRefs.current[sectionIdx];
        if (!sectionEl) continue;
        for (const i of newBullets) {
          const el = sectionEl.querySelector(`[data-bullet-idx="${i}"]`);
          if (el) flashAnimation(el);
        }
        for (const i of newParagraphs) {
          const el = sectionEl.querySelector(`[data-paragraph-idx="${i}"]`);
          if (el) flashAnimation(el);
        }
      }
    }

    prevItemsRef.current = sheet.items;

    return () => {
      for (const fn of cleanupFns) fn();
    };
  }, [sheet, view]);

  return (
    <aside className="flex min-h-0 flex-1 flex-col lg:pt-3 lg:pr-16 lg:pb-8 lg:pl-8">
      <div
        ref={scrollContainerRef}
        className="relative mx-auto flex min-h-0 w-full max-w-3xl flex-1 lg:scroll-pt-20 scroll-pt-8 flex-col overflow-y-auto bg-white lg:rounded-sm lg:shadow-[0_2px_12px_rgba(60,40,10,0.06)] lg:ring-1 lg:ring-black/5"
      >
        {(() => {
          const rewrite =
            view === "narrative" && onRewriteNarrative
              ? { onClick: onRewriteNarrative, exists: hasNarrative }
              : view === "poem" && onRewritePoem
                ? { onClick: onRewritePoem, exists: poem !== null }
                : null;
          if (isEmpty) return null;
          return (
            <div className="sticky top-0 z-10 hidden bg-white px-4 pt-6 lg:block lg:px-12">
            <div className="flex items-end justify-between border-b border-stone-200">
              <SheetTabs
                view={view}
                primary={primary}
                onChange={onViewChange}
              />
              {rewrite && (
                <button
                  type="button"
                  onClick={rewrite.onClick}
                  disabled={isRunning || drafting !== null}
                  className="mb-2.5 inline-flex items-center gap-1.5 text-base text-[#a3712a] transition hover:text-[#7c5518] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <PencilIcon />
                  {drafting === view
                    ? "Drafting…"
                    : rewrite.exists
                      ? "Rewrite"
                      : "Draft"}
                </button>
              )}
            </div>
            </div>
          );
        })()}
        <div className="space-y-6 px-4 pt-4 pb-10 lg:space-y-8 lg:px-12 lg:pt-12 lg:pb-14">
          {drafting === view && (
            <div
              role="status"
              aria-label="Drafting"
              className="flex items-center gap-2 text-sm text-stone-500"
            >
              <span>Drafting</span>
              <span className="flex h-5 items-center gap-1.5" aria-hidden="true">
                <span className="thinking-dot" style={{ animationDelay: "0s" }} />
                <span className="thinking-dot" style={{ animationDelay: "0.15s" }} />
                <span className="thinking-dot" style={{ animationDelay: "0.3s" }} />
              </span>
            </div>
          )}
          {(() => {
            const currentTitle =
              view === "narrative" && narrative
                ? narrative.title
                : view === "poem" && poem
                  ? poem.title
                  : sheet.title;
            if (!currentTitle) return null;
            return (
              <h2 className="text-xl font-semibold text-stone-900 lg:text-2xl">
                {currentTitle}
              </h2>
            );
          })()}
          {view === "narrative" ? (
            narrative && hasNarrative ? (
              <NarrativeView narrative={narrative} />
            ) : (
              <div className="mt-3 text-center text-lg leading-relaxed text-stone-400 italic">
                Nothing drafted yet.
              </div>
            )
          ) : view === "poem" ? (
            poem ? (
              <PoemView poem={poem} />
            ) : (
              <div className="mt-3 text-center text-lg leading-relaxed text-stone-400 italic">
                No poem yet.
              </div>
            )
          ) : (
            <>
              {sheet.items.length === 0 ? (
                <div className="mt-3 text-center text-lg leading-relaxed text-stone-400 italic">
                  Your notes will take shape here as you learn.
                </div>
              ) : (
                sheet.items.map((item, i) => (
                  <div
                    key={i}
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    className="-mx-3 rounded-md px-3"
                  >
                    <SheetItem item={item} />
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
};

const PHASE_LABELS = [
  "Choose a text",
  "Uncover questions",
  "Add a new perspective",
  "Grapple and connect",
  "Weigh answers",
  "Draft your chidush",
];

const PhaseIndicator = ({ phase }: { phase: number }) => {
  const total = 6;
  const elements: JSX.Element[] = [];
  for (let step = 1; step <= total; step++) {
    if (step > 1) {
      const lineColor =
        step < phase
          ? "bg-[#b89476]"
          : step === phase
            ? "bg-[#e8c8a4]"
            : "bg-stone-200";
      elements.push(
        <div
          key={`line-${step}`}
          className={`w-0.5 flex-1 min-h-4 ${lineColor}`}
        />,
      );
    }
    const dotColor =
      step < phase
        ? "bg-[#b89476]"
        : step === phase
          ? "bg-[#e8c8a4]"
          : "bg-stone-200";
    elements.push(
      <div
        key={`dot-${step}`}
        className="group relative h-3 w-3 shrink-0"
      >
        <div className={`h-full w-full rounded-full ${dotColor}`} />
        <span
          role="tooltip"
          className="pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#f7f1de] px-2.5 py-1.5 text-sm font-medium text-stone-800 opacity-0 shadow-sm ring-1 ring-stone-300/60 transition-opacity duration-150 group-hover:opacity-100"
        >
          {PHASE_LABELS[step - 1]}
        </span>
      </div>,
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col items-center px-4 pt-[62px] pb-[82px]">
      {elements}
    </div>
  );
};

// Top ~100 most popular Google Fonts serifs (incl. slab, display, blackletter).
const POPULAR_FONTS = [
  "Playfair Display",
  "Merriweather",
  "Roboto Slab",
  "Lora",
  "PT Serif",
  "EB Garamond",
  "Libre Baskerville",
  "Crimson Text",
  "Source Serif 4",
  "Bitter",
  "Inria Serif",
  "Slabo 27px",
  "Spectral",
  "Vollkorn",
  "Cardo",
  "Cinzel",
  "Domine",
  "Bree Serif",
  "Old Standard TT",
  "Fraunces",
  "Newsreader",
  "DM Serif Display",
  "DM Serif Text",
  "Bodoni Moda",
  "Yeseva One",
  "Crimson Pro",
  "Cormorant",
  "Cormorant Garamond",
  "Cormorant Infant",
  "Cormorant SC",
  "Tinos",
  "Noto Serif",
  "Noto Serif Display",
  "Libre Caslon Text",
  "Libre Caslon Display",
  "Marcellus",
  "Marcellus SC",
  "Abril Fatface",
  "Alegreya",
  "Alegreya SC",
  "Italiana",
  "Vidaloka",
  "Limelight",
  "Forum",
  "Bevan",
  "Della Respira",
  "Krona One",
  "Aboreto",
  "Karantina",
  "Holtwood One SC",
  "Stardos Stencil",
  "Bona Nova",
  "Ribeye",
  "Almendra Display",
  "Almendra",
  "UnifrakturMaguntia",
  "Pirata One",
  "MedievalSharp",
  "Special Elite",
  "Henny Penny",
  "Kavoon",
  "Glegoo",
  "Eczar",
  "Suranna",
  "Lustria",
  "Rufina",
  "Ledger",
  "Frank Ruhl Libre",
  "Maitree",
  "Petrona",
  "Yrsa",
  "Texturina",
  "Imbue",
  "Gloock",
  "Sansita",
  "Sansita Swashed",
  "Marko One",
  "IM Fell DW Pica",
  "IM Fell English",
  "IM Fell Double Pica",
  "Buenard",
  "Voltaire",
  "Caudex",
  "Sancreek",
  "Cutive",
  "Quintessential",
  "Sirin Stencil",
  "Stoke",
  "Pridi",
  "Sumana",
  "Asar",
  "Trirong",
  "Linden Hill",
  "Antic Slab",
  "Berkshire Swash",
  "Macondo",
  "Spectral SC",
  "Esteban",
  "Yatra One",
  "Cherry Swash",
  "Aleo",
  "Crete Round",
];

function fontStack(name: string) {
  return `"${name}", serif`;
}

const loadedFonts = new Set<string>();
function loadFont(name: string) {
  if (loadedFonts.has(name)) return;
  loadedFonts.add(name);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    name,
  ).replace(/%20/g, "+")}&display=swap`;
  document.head.appendChild(link);
}

const loadedFontWeights = new Set<string>();
function loadFontWeight(name: string, weight: number) {
  const key = `${name}@${weight}`;
  if (loadedFontWeights.has(key)) return;
  loadedFontWeights.add(key);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    name,
  ).replace(/%20/g, "+")}:wght@${weight}&display=swap`;
  link.onerror = () => {
    link.remove();
    loadedFontWeights.delete(key);
  };
  document.head.appendChild(link);
}

const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

function ErrorBanner({
  message,
  onRetry,
  onDismiss,
  retryDisabled,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  retryDisabled?: boolean;
}) {
  return (
    <div
      role="alert"
      className="mb-3 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-stone-800"
    >
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retryDisabled}
          className="shrink-0 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-stone-800 ring-1 ring-stone-300 transition hover:bg-stone-50 disabled:opacity-50"
        >
          Retry
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-md px-1.5 text-stone-500 transition hover:text-stone-800"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function Thread({
  sheet,
  narrative,
  poem,
  phase,
  headerRight,
  isRunning = false,
  onRewriteNarrative,
  onRewritePoem,
  drafting = null,
  loadEpoch = 0,
  error = null,
  onRetry,
  onDismissError,
}: {
  sheet: SourceSheet;
  narrative: NarrativeSheet | null;
  poem: PoemSheet | null;
  phase: number;
  headerRight?: ReactNode;
  isRunning?: boolean;
  onRewriteNarrative?: () => void;
  onRewritePoem?: () => void;
  /** Which sheet a background draft is producing, if any. */
  drafting?: "narrative" | "poem" | null;
  loadEpoch?: number;
  error?: string | null;
  onRetry?: () => void;
  onDismissError?: () => void;
}) {
  const [fontName, setFontName] = useState<string>("EB Garamond");
  const [titleSize, setTitleSize] = useState<number>(26);
  const [titleWeight, setTitleWeight] = useState<number>(400);
  const [titleAccent, setTitleAccent] = useState<boolean>(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [logotypeMenuUnlocked, setLogotypeMenuUnlocked] = useState(false);
  const logoClickCountRef = useRef(0);
  const logoClickTimeoutRef = useRef<number | null>(null);
  const chatViewportRef = useRef<HTMLDivElement>(null);

  // When a session loads (loadEpoch bumps), scroll the chat viewport to top.
  // The per-message scrollIntoView effects fire on mount; setTimeout(0) defers
  // our scroll until after those settle so it wins.
  useEffect(() => {
    if (loadEpoch === 0) return;
    const t = window.setTimeout(() => {
      chatViewportRef.current?.scrollTo({ top: 0, behavior: "auto" });
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadEpoch]);
  const handleLogoClick = () => {
    if (logoClickTimeoutRef.current !== null) {
      window.clearTimeout(logoClickTimeoutRef.current);
    }
    logoClickCountRef.current += 1;
    if (logoClickCountRef.current >= 5) {
      setLogotypeMenuUnlocked(true);
      logoClickCountRef.current = 0;
      logoClickTimeoutRef.current = null;
      return;
    }
    logoClickTimeoutRef.current = window.setTimeout(() => {
      logoClickCountRef.current = 0;
      logoClickTimeoutRef.current = null;
    }, 1500);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) {
      for (const n of POPULAR_FONTS) loadFont(n);
    }
  }, [menuOpen]);

  useEffect(() => {
    loadFont(fontName);
    for (const w of FONT_WEIGHTS) loadFontWeight(fontName, w);
  }, [fontName]);

  const fontFamily = fontStack(fontName);
  const subtitleSize = Math.max(13, Math.round(titleSize * 0.65));

  // ---- Mobile / desktop layout state ----
  const hasNarrative =
    narrative !== null &&
    (narrative.items.length > 0 || (narrative.title ?? "").length > 0);
  const [sheetView, setSheetView] = useState<SheetView>("notes");
  const [mobileTab, setMobileTab] = useState<"chat" | "notes" | "narrative">(
    "chat",
  );
  const prevHasNarrativeRef = useRef(false);

  // First time a narrative appears: switch sheet view to narrative; if user is
  // already on the sheet tabs on mobile, also flip the mobile tab to narrative.
  useEffect(() => {
    if (hasNarrative && !prevHasNarrativeRef.current) {
      setSheetView("narrative");
      setMobileTab((t) => (t === "chat" ? "chat" : "narrative"));
    }
    prevHasNarrativeRef.current = hasNarrative;
  }, [hasNarrative]);

  const handleSheetViewChange = (v: SheetView) => {
    setSheetView(v);
    if (v === "notes") setMobileTab("notes");
    if (v === "narrative") setMobileTab("narrative");
  };
  const handleMobileTabChange = (t: "chat" | "notes" | "narrative") => {
    setMobileTab(t);
    if (t === "notes") setSheetView("notes");
    if (t === "narrative") setSheetView("narrative");
  };

  return (
    <ThreadPrimitive.Root className="flex h-dvh flex-col bg-[#fdfaf2]">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center bg-[#fdfaf2] px-3 pt-3 pb-2 lg:px-0 lg:pt-6 lg:pb-3">
        <div className="lg:pr-8 lg:pl-16">
          <div className="mx-auto flex max-w-3xl items-baseline gap-3">
            <h1
              className="leading-tight select-none"
              onClick={handleLogoClick}
              style={{
                fontFamily,
                fontSize: `${titleSize}px`,
                fontWeight: titleWeight,
                letterSpacing: "0.04em",
                color: titleAccent
                  ? "oklch(0.473 0.137 46.201)"
                  : "var(--color-stone-800)",
                cursor: "default",
              }}
            >
              Chidush Builder
            </h1>
            <p
              className="hidden text-stone-500 lg:block"
              style={{ fontFamily, fontSize: `${subtitleSize}px` }}
            >
              Guided learning, creative outcomes
            </p>
          </div>
        </div>
        <div />
        <div ref={menuRef} className="relative flex items-center justify-end gap-2 lg:pr-16">
          {headerRight}
          {logotypeMenuUnlocked && (<>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
          >
            <span style={{ fontFamily }}>{fontName}</span>
            <span className="text-stone-400">
              · {titleSize}px · {titleWeight}
            </span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              aria-hidden="true"
              className="text-stone-400"
            >
              <path
                d="M3 4.5 L6 7.5 L9 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute top-full right-16 z-50 mt-2 w-72 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg">
              <div className="border-b border-stone-200 bg-stone-50">
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-xs font-medium text-stone-500 uppercase">
                    Size
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTitleSize((s) => Math.max(10, s - 2))}
                      className="flex h-6 w-6 items-center justify-center rounded border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                      aria-label="Decrease size"
                    >
                      −
                    </button>
                    <span className="w-10 text-center font-mono text-sm text-stone-700 tabular-nums">
                      {titleSize}px
                    </span>
                    <button
                      type="button"
                      onClick={() => setTitleSize((s) => Math.min(96, s + 2))}
                      className="flex h-6 w-6 items-center justify-center rounded border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                      aria-label="Increase size"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 px-3 pt-1 pb-2">
                  <span className="text-xs font-medium text-stone-500 uppercase">
                    Weight
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {FONT_WEIGHTS.map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setTitleWeight(w)}
                        className={`flex h-6 w-7 items-center justify-center rounded border text-xs tabular-nums ${
                          titleWeight === w
                            ? "border-amber-700 bg-amber-50 text-stone-800"
                            : "border-stone-300 bg-white text-stone-600 hover:bg-stone-100"
                        }`}
                        style={{ fontWeight: w }}
                        aria-label={`Weight ${w}`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 px-3 pt-1 pb-2">
                  <span className="text-xs font-medium text-stone-500 uppercase">
                    Color
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setTitleAccent(false)}
                      className={`flex h-6 items-center gap-1.5 rounded border px-2 text-xs ${
                        !titleAccent
                          ? "border-amber-700 bg-amber-50 text-stone-800"
                          : "border-stone-300 bg-white text-stone-600 hover:bg-stone-100"
                      }`}
                      aria-pressed={!titleAccent}
                    >
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ background: "var(--color-stone-800)" }}
                      />
                      Black
                    </button>
                    <button
                      type="button"
                      onClick={() => setTitleAccent(true)}
                      className={`flex h-6 items-center gap-1.5 rounded border px-2 text-xs ${
                        titleAccent
                          ? "border-amber-700 bg-amber-50 text-stone-800"
                          : "border-stone-300 bg-white text-stone-600 hover:bg-stone-100"
                      }`}
                      aria-pressed={titleAccent}
                    >
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ background: "oklch(0.473 0.137 46.201)" }}
                      />
                      Accent
                    </button>
                  </div>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto py-1">
                {POPULAR_FONTS.map((name) => {
                  const isActive = name === fontName;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setFontName(name)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-stone-50 ${
                        isActive ? "bg-amber-50" : ""
                      }`}
                    >
                      <span
                        className="truncate text-base text-stone-800"
                        style={{ fontFamily: fontStack(name) }}
                      >
                        {name}
                      </span>
                      <span className="shrink-0 text-xs text-stone-400">
                        {name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          </>)}
        </div>
      </header>

      {/* Mobile tab bar: Chat | Notes | Narrative */}
      <div className="flex shrink-0 justify-start gap-1 border-b border-stone-200 bg-[#fdfaf2] px-3 lg:hidden">
        {(
          [
            { id: "chat", label: "Chat" },
            { id: "notes", label: "Notes" },
            { id: "narrative", label: "Narrative" },
          ] as const
        ).map((t) => {
          const active = mobileTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleMobileTabChange(t.id)}
              className={`relative px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "text-[oklch(0.473_0.137_46.201)]"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              {t.label}
              <span
                className={`pointer-events-none absolute right-3 bottom-0 left-3 h-0.5 rounded-full transition-opacity ${
                  active
                    ? "bg-[oklch(0.473_0.137_46.201)] opacity-100"
                    : "opacity-0"
                }`}
              />
            </button>
          );
        })}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_auto_1fr]">
        {/* Chat pane */}
        <div
          className={`min-h-0 flex-col lg:flex lg:pt-3 lg:pr-8 lg:pb-8 lg:pl-16 ${
            mobileTab === "chat" ? "flex" : "hidden lg:flex"
          }`}
        >
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden bg-white lg:rounded-sm lg:shadow-[0_2px_12px_rgba(60,40,10,0.06)] lg:ring-1 lg:ring-black/5">
            <ThreadPrimitive.Viewport
              ref={chatViewportRef}
              autoScroll={false}
              className="flex-1 scroll-pt-8 overflow-y-auto px-4 pt-5 text-base leading-relaxed lg:px-6 lg:pt-8 lg:text-lg"
            >
              <ThreadPrimitive.Messages
                components={{
                  UserMessage,
                  AssistantMessage,
                }}
              />
              <div className="h-4" />
            </ThreadPrimitive.Viewport>

            <div className="border-t border-stone-200 bg-[#f7f1de] px-3 py-3 lg:px-6 lg:py-4">
              {error && (
                <ErrorBanner
                  message={error}
                  onRetry={onRetry}
                  onDismiss={onDismissError}
                  retryDisabled={isRunning}
                />
              )}
              <ComposerPrimitive.Root className="flex items-end gap-2 rounded-2xl border border-stone-300 bg-white px-3 py-2 focus-within:border-amber-800 lg:px-4">
                <ComposerPrimitive.Input
                  autoFocus
                  rows={1}
                  placeholder="Reply…"
                  className="flex-1 resize-none bg-transparent py-1 text-base text-stone-900 outline-none placeholder:text-stone-500 lg:text-lg"
                />
                <ComposerPrimitive.Send
                  aria-label="Send"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.473_0.137_46.201)] text-white"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M22 2 11 13" />
                    <path d="M22 2 15 22l-4-9-9-4Z" />
                  </svg>
                </ComposerPrimitive.Send>
              </ComposerPrimitive.Root>
            </div>
          </div>
        </div>

        {/* PhaseIndicator: desktop only */}
        <div className="hidden lg:contents">
          <PhaseIndicator phase={phase} />
        </div>

        {/* Sheet pane */}
        <div
          className={`min-h-0 ${
            mobileTab === "chat" ? "hidden lg:flex" : "flex"
          } lg:flex lg:flex-col`}
        >
          <SourceSheetPanel
            sheet={sheet}
            narrative={narrative}
            poem={poem}
            isRunning={isRunning}
            onRewriteNarrative={onRewriteNarrative}
            onRewritePoem={onRewritePoem}
            drafting={drafting}
            view={sheetView}
            onViewChange={handleSheetViewChange}
          />
        </div>
      </div>
    </ThreadPrimitive.Root>
  );
}

