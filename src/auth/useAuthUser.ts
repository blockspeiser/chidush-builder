import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";

export type AuthState =
  | { status: "loading"; user: null }
  | { status: "signed-out"; user: null }
  | { status: "signed-in"; user: User };

/** Tracks Firebase auth state; `loading` until the SDK restores a session. */
export function useAuthUser(): AuthState {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
  });

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setState(
        user
          ? { status: "signed-in", user }
          : { status: "signed-out", user: null },
      );
    });
  }, []);

  return state;
}
