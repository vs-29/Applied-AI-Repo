import { waitUntil } from "@vercel/functions";

/**
 * Run work after the response has been sent.
 *
 * On Vercel, `waitUntil` keeps the function alive until the promise settles
 * (still bounded by the route's `maxDuration`). Elsewhere, e.g. `next dev` or
 * `next start`, it's a no-op and the promise simply keeps running in the
 * long-lived Node process. Either way the client gets an immediate response
 * and follows progress through the source's `status` field.
 *
 * Errors are logged rather than thrown: there's no request left to fail, and
 * the work itself is expected to record failures (ingestSource sets status
 * "error" with a message).
 */
export function runInBackground(label: string, work: () => Promise<void>): void {
  const promise = work().catch((err) => {
    console.error(`[background] ${label} failed:`, err);
  });
  waitUntil(promise);
}
