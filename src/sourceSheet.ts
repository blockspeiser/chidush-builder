export type CitationItem = {
  type: "citation";
  reference: string;
};

export type NotesItem = {
  type: "notes";
  heading: string;
  bullets?: string[];
  paragraphs?: string[];
};

export type SourceSheetItem = CitationItem | NotesItem;

export type SourceSheet = {
  title?: string;
  items: SourceSheetItem[];
};

export const EMPTY_SHEET: SourceSheet = { items: [] };

export function isValidSheetItem(x: unknown): x is SourceSheetItem {
  if (!x || typeof x !== "object") return false;
  const obj = x as Record<string, unknown>;
  if (obj.type === "citation") {
    return typeof obj.reference === "string" && obj.reference.length > 0;
  }
  if (obj.type === "notes") {
    if (typeof obj.heading !== "string" || obj.heading.length === 0) return false;
    if (
      obj.bullets !== undefined &&
      (!Array.isArray(obj.bullets) ||
        !obj.bullets.every((b) => typeof b === "string"))
    ) {
      return false;
    }
    if (
      obj.paragraphs !== undefined &&
      (!Array.isArray(obj.paragraphs) ||
        !obj.paragraphs.every((p) => typeof p === "string"))
    ) {
      return false;
    }
    return true;
  }
  return false;
}

export function coerceSheetItems(input: unknown): SourceSheetItem[] {
  if (!Array.isArray(input)) return [];
  return input.filter(isValidSheetItem);
}

export type NarrativeCitationItem = { type: "citation"; reference: string };
export type NarrativeProseItem = { type: "prose"; markdown: string };
export type NarrativeItem = NarrativeCitationItem | NarrativeProseItem;

export type NarrativeSheet = {
  title?: string;
  items: NarrativeItem[];
};

export function isValidNarrativeItem(x: unknown): x is NarrativeItem {
  if (!x || typeof x !== "object") return false;
  const obj = x as Record<string, unknown>;
  if (obj.type === "citation") {
    return typeof obj.reference === "string" && obj.reference.length > 0;
  }
  if (obj.type === "prose") {
    return typeof obj.markdown === "string" && obj.markdown.length > 0;
  }
  return false;
}

export function coerceNarrativeItems(input: unknown): NarrativeItem[] {
  if (!Array.isArray(input)) return [];
  return input.filter(isValidNarrativeItem);
}

export type PoemSheet = {
  title?: string;
  markdown: string;
};
