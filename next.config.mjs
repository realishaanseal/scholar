import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

const base = withNextIntl(nextConfig);

/*
  Sentry's build plugin is applied only when a DSN is configured. Wrapping
  unconditionally makes every local build and every fork's CI try to upload
  source maps to an organisation they have no credentials for, which turns a
  monitoring nicety into a build failure for anyone who is not us.
*/
const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

export default sentryEnabled
  ? withSentryConfig(base, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // Source maps are uploaded and then deleted from the deployed output, so
      // stack traces are readable in Sentry without publishing the original
      // source to anyone who opens devtools.
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      silent: !process.env.CI,
      // Routes Sentry's own requests through the app's origin so an ad blocker
      // does not silently swallow every error report.
      tunnelRoute: "/monitoring",
      disableLogger: true,
      telemetry: false,
    })
  : base;
