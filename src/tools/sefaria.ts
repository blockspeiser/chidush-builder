// Read-only Sefaria API calls backing the research tools, via our server proxy.

import { authFetch } from "../auth/authFetch";

const SEFARIA = "/api/sefaria";

export type TextSearchHit = {
  ref?: string;
  categories?: string[];
  text_snippet?: string;
};

export type CalendarItem = {
  title?: string;
  ref?: string;
  display?: string;
};

export async function executeReadText(args: { reference: string }): Promise<{
  ref?: string;
  heRef?: string;
  category?: string;
  versionTitle?: string;
  text: unknown;
}> {
  const ref = args.reference;
  if (!ref || typeof ref !== "string") throw new Error("missing reference");
  const url = `${SEFARIA}/v3/texts/${encodeURIComponent(ref)}?version=english`;
  const resp = await authFetch(url);
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

export type LinkCategorySummary = {
  category?: string;
  count?: number;
  books?: Record<string, number>;
};

export async function executeGetLinks(args: {
  reference: string;
}): Promise<LinkCategorySummary[]> {
  const ref = args.reference;
  if (!ref || typeof ref !== "string") throw new Error("missing reference");
  const resp = await authFetch(
    `${SEFARIA}/link-summary/${encodeURIComponent(ref)}`,
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

export async function executeGetCalendar(): Promise<{
  date?: string;
  items: CalendarItem[];
}> {
  const resp = await authFetch(`${SEFARIA}/calendars`);
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

export async function executeTextSearch(args: {
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
    const resp = await authFetch(`${SEFARIA}/search-wrapper`, {
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
