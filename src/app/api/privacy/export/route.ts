import { NextResponse } from "next/server";
import { personalRoute } from "@/lib/api/guard";
import { exportPersonalData } from "@/domains/privacy";

export const runtime = "nodejs";

/**
 * Everything Scholar holds about you.
 *
 * A personal route, not an institutional one: this is a right a person holds
 * over their own data, and it is not something an administrator grants. The
 * subject is always the caller — there is no id parameter, so this endpoint
 * cannot be pointed at anybody else.
 *
 * Served as a download rather than rendered, because the answer to a subject
 * access request is a file someone keeps rather than a page they scroll.
 */
export const GET = personalRoute(async ({ userId }) => {
  const bundle = await exportPersonalData(userId);
  const body = JSON.stringify(bundle, null, 2);

  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="scholar-data-${userId.slice(0, 8)}.json"`,
      // This is the most personal payload the application produces. A shared
      // cache holding it would be the worst possible thing to get wrong.
      "cache-control": "no-store",
    },
  });
});
