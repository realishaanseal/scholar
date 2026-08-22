import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Facebook from "next-auth/providers/facebook";

/**
 * Edge-safe slice of the auth setup: no database, no bcrypt.
 * `middleware.ts` uses only this; the full config in `auth.ts` extends it.
 */

export const enabledOAuthProviders = {
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  github: Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET),
  facebook: Boolean(process.env.AUTH_FACEBOOK_ID && process.env.AUTH_FACEBOOK_SECRET),
};

/** Only register a provider when its credentials exist, so the sign-in page
 *  never shows a button that leads to a crash. */
const oauthProviders: NextAuthConfig["providers"] = [];

if (enabledOAuthProviders.google) {
  oauthProviders.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}
if (enabledOAuthProviders.github) {
  oauthProviders.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}
if (enabledOAuthProviders.facebook) {
  oauthProviders.push(
    Facebook({
      clientId: process.env.AUTH_FACEBOOK_ID,
      clientSecret: process.env.AUTH_FACEBOOK_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login", newUser: "/dashboard" },
  providers: oauthProviders,
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const isProtected = path.startsWith("/dashboard") || path.startsWith("/settings");
      if (isProtected) return Boolean(auth?.user);
      return true;
    },
  },
} satisfies NextAuthConfig;
