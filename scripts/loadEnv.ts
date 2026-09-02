import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load .env.local / .env for command-line scripts.
 *
 * Next does this automatically for the app, but a tsx script gets a bare
 * process.env — which meant every script here needed a connection string
 * exported by hand first, in shell syntax that differs between PowerShell and
 * bash. That is the step people get wrong, and getting it wrong looks
 * identical to the database being unreachable.
 *
 * Deliberately minimal, and deliberately not a dependency: it reads
 * KEY=value, strips optional quotes, ignores comments, and never overwrites a
 * variable that is already set, so an explicit export still wins over a file.
 */

const FILES = [".env.local", ".env"];

export function loadEnv(cwd = process.cwd()): string[] {
  const loaded: string[] = [];

  for (const name of FILES) {
    const path = resolve(cwd, name);
    if (!existsSync(path)) continue;

    for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const eq = line.indexOf("=");
      if (eq === -1) continue;

      const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
      if (!key || key in process.env) continue;

      let value = line.slice(eq + 1).trim();
      // Vercel writes values quoted; a connection string is full of characters
      // that would otherwise need escaping.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    loaded.push(name);
  }

  return loaded;
}

/**
 * Resolve the database URL, with an error that says what to actually do.
 *
 * A bare "DATABASE_URL is not set" leaves someone guessing whether they typed
 * the export wrong, are in the wrong directory, or never had the value.
 */
export function requireDatabaseUrl(): string {
  const files = loadEnv();
  const url = process.env.DATABASE_URL;
  if (url) return url;

  console.error(
    [
      "",
      "DATABASE_URL is not set.",
      "",
      files.length
        ? `  Read ${files.join(" and ")}, but neither defines DATABASE_URL.`
        : "  No .env.local or .env file found in this directory.",
      "",
      "  If this project is linked to Vercel, pull the real values:",
      "",
      "    npx vercel env pull .env.local",
      "",
      "  Or create .env.local yourself with a single line:",
      "",
      "    DATABASE_URL=postgresql://user:password@host/database",
      "",
    ].join("\n")
  );
  process.exit(1);
}
