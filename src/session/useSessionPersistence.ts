// Loads the session named in the URL on startup, autosaves changes, and
// switches between sessions.

import { useEffect, useRef, useState } from "react";
import type { Conversation } from "../chat/useConversation";
import type { StudyState } from "../study/useStudyState";
import {
  fetchSession,
  readSlugFromUrl,
  replaceUrl,
  saveSession,
  sessionPath,
  shortSessionId,
} from "./api";

const AUTOSAVE_DELAY_MS = 500;

export function useSessionPersistence(
  conversation: Conversation,
  study: StudyState,
) {
  const { messages, setMessages, sendToClaude } = conversation;
  const sessionIdRef = useRef<string | null>(null);
  const autosaveHandleRef = useRef<number | null>(null);
  const initialized = useRef(false);
  const [loaded, setLoaded] = useState(false);
  // Bumped whenever a different session is loaded so views can reset scroll etc.
  const [loadEpoch, setLoadEpoch] = useState(0);

  // Sessions are only written once the learner has actually said something.
  const hasUserMessage = messages.some((m) => m.role === "user");

  function cancelPendingAutosave() {
    if (autosaveHandleRef.current !== null) {
      window.clearTimeout(autosaveHandleRef.current);
      autosaveHandleRef.current = null;
    }
  }

  function currentPayload() {
    return { messages, ...study.snapshot };
  }

  /** Writes the current session immediately, if it has anything worth saving. */
  async function flushCurrent(label: string) {
    cancelPendingAutosave();
    const id = sessionIdRef.current;
    if (!id || !hasUserMessage) return;
    try {
      await saveSession(id, currentPayload());
    } catch (e) {
      console.warn(`[${label}] flush failed`, e);
    }
  }

  function startNewSession() {
    const newId = shortSessionId();
    sessionIdRef.current = newId;
    console.log("[session] new", newId);
    void sendToClaude([]);
  }

  // Initial load: restore the session in the URL, or start a fresh one.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      const slug = readSlugFromUrl();
      if (slug) {
        try {
          const data = await fetchSession(slug);
          sessionIdRef.current = slug;
          if (Array.isArray(data.messages)) setMessages(data.messages);
          study.hydrate(data);
          setLoaded(true);
          setLoadEpoch((e) => e + 1);
          console.log("[session] loaded from URL", slug);
          return;
        } catch (e) {
          console.warn("[session] URL load failed", slug, e);
          replaceUrl("/");
        }
      }
      setLoaded(true);
      startNewSession();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave whenever anything persisted changes.
  useEffect(() => {
    if (!loaded) return;
    const id = sessionIdRef.current;
    if (!id || !hasUserMessage) return;
    cancelPendingAutosave();
    autosaveHandleRef.current = window.setTimeout(() => {
      autosaveHandleRef.current = null;
      saveSession(id, currentPayload())
        .then(() => replaceUrl(sessionPath(id)))
        .catch((e) => console.warn("[autosave] failed", e));
    }, AUTOSAVE_DELAY_MS);
    return cancelPendingAutosave;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loaded,
    messages,
    study.sourceSheet,
    study.narrativeSheet,
    study.poemSheet,
    study.currentPhase,
  ]);

  async function loadSession(targetId: string) {
    if (sessionIdRef.current !== targetId) await flushCurrent("load");
    else cancelPendingAutosave();
    try {
      const data = await fetchSession(targetId);
      sessionIdRef.current = targetId;
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      study.hydrate(data);
      replaceUrl(sessionPath(targetId));
      setLoadEpoch((e) => e + 1);
      console.log("[session] loaded", targetId);
    } catch (e) {
      console.warn("[load] failed", e);
    }
  }

  async function newSession() {
    await flushCurrent("new");
    setMessages([]);
    study.reset();
    replaceUrl("/");
    startNewSession();
  }

  return { sessionIdRef, loadEpoch, loadSession, newSession };
}
