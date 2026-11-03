import { auth } from "@/auth";
import { HttpError } from "./http";
import { getNotebook, getSource } from "./store";
import type { Notebook, Source } from "./types";

/** The signed-in user's id, or a 401. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new HttpError(401, "Sign in required.");
  return id;
}

/**
 * Load a notebook the user owns. Someone else's notebook returns 404, not 403,
 * so that ids belonging to other users can't be probed for existence.
 */
export async function requireNotebook(id: string, userId: string): Promise<Notebook> {
  const notebook = await getNotebook(id);
  if (!notebook || notebook.ownerId !== userId) {
    throw new HttpError(404, "Notebook not found.");
  }
  return notebook;
}

/** Load a source the user owns (404 otherwise, as above). */
export async function requireSource(id: string, userId: string): Promise<Source> {
  const source = await getSource(id);
  if (!source || source.ownerId !== userId) {
    throw new HttpError(404, "Source not found.");
  }
  return source;
}
