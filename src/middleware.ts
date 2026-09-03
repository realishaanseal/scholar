import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Edge-safe: this instance has no database adapter, so it only reads the JWT cookie.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/timetable/:path*",
    "/insights/:path*",
    "/groups/:path*",
    "/learn/:path*",
    "/teach/:path*",
    "/admin/:path*",
  ],
};
