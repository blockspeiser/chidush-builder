// fetch() that attaches the signed-in user's ID token. All /api calls use it.

import { getIdToken } from "./firebase";

export async function authHeaders(
  init?: HeadersInit,
): Promise<Headers> {
  const headers = new Headers(init);
  const token = await getIdToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(input, { ...init, headers: await authHeaders(init.headers) });
}
