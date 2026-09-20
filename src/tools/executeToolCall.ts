// Dispatches a client-side tool call to either a Sefaria fetch or a study-state effect.

import type { ToolCallPart } from "../chat/types";
import {
  coerceNarrativeItems,
  coerceSheetItems,
  type NarrativeSheet,
  type PoemSheet,
  type SourceSheet,
} from "../sourceSheet";
import {
  FOCUS_TEXT_TOOL_NAME,
  GET_CALENDAR_TOOL_NAME,
  GET_LINKS_TOOL_NAME,
  READ_TEXT_TOOL_NAME,
  SET_PHASE_TOOL_NAME,
  SKIP_NOTES_TOOL_NAME,
  TEXT_SEARCH_TOOL_NAME,
  UPDATE_NARRATIVE_TOOL_NAME,
  UPDATE_NOTES_TOOL_NAME,
  UPDATE_POEM_TOOL_NAME,
} from "./definitions";
import {
  executeGetCalendar,
  executeGetLinks,
  executeReadText,
  executeTextSearch,
} from "./sefaria";

/** Side effects the model may trigger on the learner's study materials. */
export type StudyEffects = {
  setNotesSheet: (sheet: SourceSheet) => void;
  setNarrativeSheet: (sheet: NarrativeSheet) => void;
  setPoemSheet: (sheet: PoemSheet) => void;
  /** Adds a citation to the notes sheet if it is not already there. */
  pinCitation: (reference: string) => void;
  setPhase: (phase: number) => void;
  /** Moves to `phase` only if the current phase is earlier. */
  advancePhaseTo: (phase: number) => void;
};

/** What goes back to the model. `undefined` means "use the canned result". */
export type ToolOutcome = { result?: unknown; isError?: boolean };

function optionalTitle(args: Record<string, unknown>): string | undefined {
  const raw = args.title;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function fetchOutcome(
  label: string,
  fn: () => Promise<unknown>,
): Promise<ToolOutcome> {
  try {
    return { result: await fn() };
  } catch (e) {
    return { result: `${label} error: ${errorMessage(e)}`, isError: true };
  }
}

export async function executeToolCall(
  call: ToolCallPart,
  effects: StudyEffects,
): Promise<ToolOutcome> {
  const { toolName, args } = call;

  switch (toolName) {
    case UPDATE_NOTES_TOOL_NAME:
      effects.setNotesSheet({
        title: optionalTitle(args),
        items: coerceSheetItems(args.items),
      });
      return {};

    case SKIP_NOTES_TOOL_NAME:
      console.log(
        "[notes] skip",
        typeof args.reason === "string" ? args.reason : "",
      );
      return {};

    case UPDATE_NARRATIVE_TOOL_NAME:
      effects.setNarrativeSheet({
        title: optionalTitle(args),
        items: coerceNarrativeItems(args.items),
      });
      effects.advancePhaseTo(7);
      return {};

    case UPDATE_POEM_TOOL_NAME:
      effects.setPoemSheet({
        title: optionalTitle(args),
        markdown: typeof args.markdown === "string" ? args.markdown : "",
      });
      effects.advancePhaseTo(7);
      return {};

    case TEXT_SEARCH_TOOL_NAME:
      return fetchOutcome("search", () =>
        executeTextSearch(
          args as { query: string; size?: number; filters?: string[] },
        ),
      );

    case GET_CALENDAR_TOOL_NAME:
      return fetchOutcome("calendar", () => executeGetCalendar());

    case GET_LINKS_TOOL_NAME:
      return fetchOutcome("get_links", () =>
        executeGetLinks(args as { reference: string }),
      );

    case READ_TEXT_TOOL_NAME:
      return fetchOutcome("read_text", () =>
        executeReadText(args as { reference: string }),
      );

    case FOCUS_TEXT_TOOL_NAME: {
      const ref = args.reference;
      if (typeof ref !== "string" || ref.trim().length === 0) {
        return { result: "focus_text error: missing reference", isError: true };
      }
      const reference = ref.trim();
      effects.pinCitation(reference);
      effects.advancePhaseTo(2);
      try {
        return { result: await executeReadText({ reference }) };
      } catch (e) {
        return { result: { pinned: true, read_error: errorMessage(e) } };
      }
    }

    case SET_PHASE_TOOL_NAME: {
      const raw = args.phase;
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(n)) {
        effects.setPhase(Math.min(6, Math.max(1, Math.round(n))));
      }
      return {};
    }

    default:
      return {};
  }
}
