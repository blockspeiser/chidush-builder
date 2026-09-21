import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { Thread } from "./Thread";
import { useConversation } from "./chat/useConversation";
import { useStudyState } from "./study/useStudyState";
import { useSessionPersistence } from "./session/useSessionPersistence";
import { NewSessionButton, SessionsButton } from "./session/SessionButtons";
import { useAuthUser } from "./auth/useAuthUser";
import { SignInScreen } from "./auth/SignInScreen";
import { AccountMenu } from "./auth/AccountMenu";
import type { User } from "firebase/auth";

const REWRITE_POEM_PROMPT =
  "Please draft (or rewrite) the poem sheet now based on our conversation and the narrative so far — call update_poem_sheet with whatever is reasonable given what we have. Don't ask for confirmation, just produce the poem.";

const REWRITE_NARRATIVE_PROMPT =
  "Please draft (or rewrite) the narrative sheet now based on our conversation so far — call update_narrative_sheet with whatever is reasonable given what we have. Don't ask for confirmation, just produce the draft.";

export default function App() {
  const authState = useAuthUser();
  if (authState.status === "loading") {
    return <div className="min-h-screen bg-[#fbf8ef]" />;
  }
  if (authState.status === "signed-out") {
    return <SignInScreen />;
  }
  // Keyed on uid so a different account starts with fresh state.
  return <StudyApp key={authState.user.uid} user={authState.user} />;
}

function StudyApp({ user }: { user: User }) {
  const study = useStudyState();
  const conversation = useConversation(study.effects);
  const session = useSessionPersistence(conversation, study);

  const runtime = useExternalStoreRuntime({
    isRunning: conversation.isRunning,
    messages: conversation.messages,
    convertMessage: (m): ThreadMessageLike => ({
      id: m.id,
      role: m.role,
      content: m.content as ThreadMessageLike["content"],
    }),
    onNew: conversation.onNew,
  });

  function handleRewriteNarrative() {
    if (conversation.isRunning) return;
    void conversation.sendUserText(REWRITE_NARRATIVE_PROMPT);
  }

  function handleRewritePoem() {
    if (conversation.isRunning) return;
    void conversation.sendUserText(REWRITE_POEM_PROMPT);
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread
        sheet={study.sourceSheet}
        narrative={study.narrativeSheet}
        poem={study.poemSheet}
        phase={study.currentPhase}
        isRunning={conversation.isRunning}
        onRewriteNarrative={handleRewriteNarrative}
        onRewritePoem={handleRewritePoem}
        loadEpoch={session.loadEpoch}
        error={conversation.error}
        onRetry={() => void conversation.retry()}
        onDismissError={conversation.dismissError}
        headerRight={
          <div className="flex items-center gap-2">
            <NewSessionButton
              onClick={session.newSession}
              disabled={conversation.isRunning}
            />
            <SessionsButton
              currentId={session.sessionIdRef.current}
              onLoad={session.loadSession}
              onDeleted={(id) => {
                if (id === session.sessionIdRef.current) {
                  session.discardCurrentSession();
                }
              }}
            />
            <AccountMenu user={user} />
          </div>
        }
      />
    </AssistantRuntimeProvider>
  );
}
