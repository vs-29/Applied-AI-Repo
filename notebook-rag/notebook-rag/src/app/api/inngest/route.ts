import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

export const runtime = "nodejs";
// Each request runs a single step (one embedding batch at most), so this is a
// ceiling per step, not per source.
export const maxDuration = 60;

// Inngest calls this endpoint to discover functions (PUT) and to run steps
// (POST). Requests are verified with INNGEST_SIGNING_KEY in production.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
