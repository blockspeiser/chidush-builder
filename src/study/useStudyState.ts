// The learner's study materials: notes sheet, narrative, poem, and current phase.

import { useRef, useState } from "react";
import {
  EMPTY_SHEET,
  type NarrativeSheet,
  type PoemSheet,
  type SourceSheet,
} from "../sourceSheet";
import type { StudyEffects } from "../tools/executeToolCall";

export type StudySnapshot = {
  sourceSheet: SourceSheet;
  narrativeSheet: NarrativeSheet | null;
  poemSheet: PoemSheet | null;
  currentPhase: number;
};

export function useStudyState() {
  const [sourceSheet, setSourceSheetState] = useState<SourceSheet>(EMPTY_SHEET);
  const [narrativeSheet, setNarrativeSheet] = useState<NarrativeSheet | null>(
    null,
  );
  const [poemSheet, setPoemSheet] = useState<PoemSheet | null>(null);
  const [currentPhase, setCurrentPhase] = useState<number>(1);

  // Tool calls within a single turn run concurrently and need the latest
  // sheet synchronously, so we mirror it in a ref.
  const sourceSheetRef = useRef<SourceSheet>(EMPTY_SHEET);

  function setSourceSheet(next: SourceSheet) {
    sourceSheetRef.current = next;
    setSourceSheetState(next);
  }

  function pinCitation(reference: string) {
    const prev = sourceSheetRef.current;
    const present = prev.items.some(
      (it) => it.type === "citation" && it.reference === reference,
    );
    if (present) return;
    setSourceSheet({
      ...prev,
      items: [...prev.items, { type: "citation", reference }],
    });
  }

  function advancePhaseTo(phase: number) {
    setCurrentPhase((prev) => (prev < phase ? phase : prev));
  }

  /** Replaces all study state from a saved session, defaulting missing fields. */
  function hydrate(saved: Partial<StudySnapshot>) {
    setSourceSheet(
      saved.sourceSheet && Array.isArray(saved.sourceSheet.items)
        ? saved.sourceSheet
        : EMPTY_SHEET,
    );
    setNarrativeSheet(saved.narrativeSheet ?? null);
    setPoemSheet(saved.poemSheet ?? null);
    setCurrentPhase(
      typeof saved.currentPhase === "number" ? saved.currentPhase : 1,
    );
  }

  function reset() {
    hydrate({});
  }

  const snapshot: StudySnapshot = {
    sourceSheet,
    narrativeSheet,
    poemSheet,
    currentPhase,
  };

  const effects: StudyEffects = {
    setNotesSheet: setSourceSheet,
    setNarrativeSheet,
    setPoemSheet,
    pinCitation,
    setPhase: setCurrentPhase,
    advancePhaseTo,
  };

  return { ...snapshot, snapshot, effects, hydrate, reset };
}

export type StudyState = ReturnType<typeof useStudyState>;
