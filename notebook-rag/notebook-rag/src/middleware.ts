// First line of defence: blocks signed-out requests (see `authorized` in
// src/auth.ts). Every API route ALSO checks the user and ownership itself via
// src/lib/authz.ts, so a matcher mistake here can't expose data.
export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
