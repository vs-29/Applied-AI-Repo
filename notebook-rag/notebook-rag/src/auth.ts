import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * Auth.js configuration. Sessions are stateless JWTs (no database adapter),
 * which keeps the app at two services (OpenAI + Qdrant).
 *
 * Each user gets a stable id of the form "<provider>:<providerAccountId>"
 * (e.g. "github:1234567"). Notebooks and sources store this as `ownerId`.
 * Using the provider's account id rather than email means the id survives
 * email changes and works for accounts with a private email.
 *
 * Env: AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET (see .env.example).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    jwt({ token, account }) {
      if (account) token.uid = `${account.provider}:${account.providerAccountId}`;
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
    /**
     * Runs in middleware for every matched request. Pages redirect to
     * /signin; API routes get a JSON 401 so the client's fetch helpers can
     * surface a clean error instead of parsing a redirect's HTML.
     */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/api/auth") || pathname === "/signin") return true;
      if (auth?.user) return true;
      if (pathname.startsWith("/api/")) {
        return Response.json({ error: "Sign in required." }, { status: 401 });
      }
      return false;
    },
  },
});
