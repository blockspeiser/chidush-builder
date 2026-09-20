// Tool schemas sent to Claude, plus the bookkeeping for which ones the client executes.

export const TEXT_SEARCH_TOOL_NAME = "text_search";
export const GET_CALENDAR_TOOL_NAME = "get_calendar";
export const GET_LINKS_TOOL_NAME = "get_links";
export const READ_TEXT_TOOL_NAME = "read_text";
export const SHOW_TEXT_TOOL_NAME = "show_text";
export const FOCUS_TEXT_TOOL_NAME = "focus_text";
export const SET_PHASE_TOOL_NAME = "set_phase";
export const UPDATE_NOTES_TOOL_NAME = "update_notes_sheet";
export const SKIP_NOTES_TOOL_NAME = "skip_notes_sheet_update";
export const UPDATE_NARRATIVE_TOOL_NAME = "update_narrative_sheet";
export const UPDATE_POEM_TOOL_NAME = "update_poem_sheet";
export const CLIENT_TOOL_NAMES = new Set<string>([
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
export const CLIENT_TOOL_RESULTS: Record<string, string> = {
  [SHOW_TEXT_TOOL_NAME]: "rendered",
  [FOCUS_TEXT_TOOL_NAME]: "citation pinned to source sheet",
  [SET_PHASE_TOOL_NAME]: "phase updated",
  [UPDATE_NOTES_TOOL_NAME]: "notes sheet updated",
  [SKIP_NOTES_TOOL_NAME]: "notes sheet unchanged",
  [UPDATE_NARRATIVE_TOOL_NAME]: "narrative sheet updated",
  [UPDATE_POEM_TOOL_NAME]: "poem sheet updated",
};

export const GET_LINKS_TOOL = {
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

export const SET_PHASE_TOOL = {
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

export const FOCUS_TEXT_TOOL = {
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

export const READ_TEXT_TOOL = {
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

export const GET_CALENDAR_TOOL = {
  name: GET_CALENDAR_TOOL_NAME,
  description:
    "Retrieve today's Jewish learning calendar from Sefaria. Returns a list of items like Parashat Hashavua, Haftarah, Daf Yomi, Daily Mishnah, Daily Rambam, Halakhah Yomit, Tanya Yomi, Yerushalmi Yomi, 929, etc. — each with a title and a Sefaria reference. Use the returned references with `show_text` to display the text. Holiday substitutions (e.g. showing Shavuot II's reading instead of the weekly parsha) are handled server-side.",
  input_schema: {
    type: "object" as const,
    properties: {},
  },
};

export const TEXT_SEARCH_TOOL = {
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

export const SHOW_TEXT_TOOL = {
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

export const UPDATE_NOTES_SHEET_TOOL = {
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

export const SKIP_NOTES_SHEET_UPDATE_TOOL = {
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

export const UPDATE_NARRATIVE_SHEET_TOOL = {
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

export const UPDATE_POEM_SHEET_TOOL = {
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


/** Every tool exposed to the model, in the order sent on each request. */
export const TOOL_DEFINITIONS = [
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
];
