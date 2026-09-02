import type { z } from "zod";
import { auth } from "@/lib/auth";
import { explain, Forbidden, type Actor, type Permission, type Scope } from "@/lib/authz";
import { resolveActor } from "@/domains/identity";
import { BadRequest, errorResponse, NotFound, Unauthenticated } from "./errors";

export { BadRequest, NotFound, Unauthenticated } from "./errors";

/**
 * The authorization boundary for institutional routes.
 *
 * The brief's first rule is that every protected action enforces authorization
 * server-side, and the way to keep that true is to make the alternative
 * unwriteable. `institutionalRoute` takes the permission and the scope as
 * required arguments, so a handler cannot be registered without declaring what
 * it needs — there is no path through this wrapper that reaches the body
 * without a decision having been made.
 *
 * Scope is a function rather than a value because the organization must never
 * come from the client. A request naming assignment X is asking about whatever
 * institution X actually belongs to, which is a database question; trusting an
 * `organizationId` from the request would let anyone read anything by guessing
 * an id and naming their own institution.
 */

export type RouteArgs<P> = { req: Request; params: P; url: URL };

/**
 * The handler receives exactly the scope its resolver returned, not the wide
 * optional Scope. A resolver that reads an organization_id column returns a
 * required string, so the handler can use it without re-checking something
 * authorization has already guaranteed.
 */
export type AuthorizedArgs<P, S extends Scope = Scope> = RouteArgs<P> & {
  actor: Actor;
  userId: string;
  scope: S;
};

type Spec<P, S extends Scope> = {
  permission: Permission;
  /**
   * Resolve the scope this request acts in, from the database rather than from
   * the request. Throw NotFound if the resource does not exist.
   */
  scope: (args: RouteArgs<P>) => S | Promise<S>;
};

/**
 * A route that requires an institutional permission.
 *
 * Next passes params as a promise in App Router route handlers, so they are
 * awaited once here and handed to both the scope resolver and the handler.
 */
export function institutionalRoute<
  P extends Record<string, string> = Record<string, string>,
  S extends Scope = Scope,
>(
  spec: Spec<P, S>,
  handler: (args: AuthorizedArgs<P, S>) => Promise<Response>
) {
  return async (req: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      const session = await auth();
      const userId = session?.user?.id;
      if (!userId) throw new Unauthenticated();

      const params = await ctx.params;
      const url = new URL(req.url);
      const base: RouteArgs<P> = { req, params, url };

      // Resolved before the scope so a resolver needing to know who is asking
      // does not have to repeat the query.
      const actor = await resolveActor(userId);
      const scope = await spec.scope(base);

      const decision = explain(actor, spec.permission, scope);
      if (!decision.allowed) {
        // Logged, never returned: telling someone their request failed because
        // they do not teach section S confirms that section S exists and that
        // they guessed a real id.
        console.warn(
          "[authz] denied",
          JSON.stringify({
            userId,
            permission: spec.permission,
            scope,
            reason: decision.reason,
          })
        );
        throw new Forbidden(spec.permission, scope, decision.reason);
      }

      return await handler({ ...base, actor, userId, scope });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/**
 * A route that only requires a signed-in user — personal Scholar data, which
 * is deliberately outside the institutional permission system entirely.
 */
export function personalRoute<P extends Record<string, string> = Record<string, string>>(
  handler: (args: RouteArgs<P> & { userId: string }) => Promise<Response>
) {
  return async (req: Request, ctx?: { params: Promise<P> }): Promise<Response> => {
    try {
      const session = await auth();
      const userId = session?.user?.id;
      if (!userId) throw new Unauthenticated();

      const params = ((await ctx?.params) ?? {}) as P;
      return await handler({ req, params, url: new URL(req.url), userId });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/**
 * Parse and validate a JSON body.
 *
 * Returns the first validation message, which is written for a person: these
 * surface directly in the UI, so "Give the assignment a title" beats a Zod
 * path dump.
 */
export async function readBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<z.infer<T>> {
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequest(parsed.error.issues[0]?.message ?? "That request was not valid.");
  }
  return parsed.data;
}

/**
 * A route whose subject is reachable through more than one relationship.
 *
 * A file can be attached to an assignment in one course and published as a
 * material in another, so "may this person read it" is a question about a set
 * of scopes rather than one. Permitting on the first scope that passes is
 * correct here and not a weakening: each candidate is a real relationship the
 * subject genuinely has, and every one of them is checked by the same policy
 * engine as any other route.
 *
 * An empty candidate list denies. A subject nothing references is reachable by
 * nobody, which is the safe reading and also the true one.
 */
export function institutionalRouteAny<
  P extends Record<string, string> = Record<string, string>,
  S extends Scope = Scope,
>(
  spec: {
    permission: Permission;
    scopes: (args: RouteArgs<P>) => S[] | Promise<S[]>;
  },
  handler: (args: AuthorizedArgs<P, S>) => Promise<Response>
) {
  return async (req: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      const session = await auth();
      const userId = session?.user?.id;
      if (!userId) throw new Unauthenticated();

      const params = await ctx.params;
      const base: RouteArgs<P> = { req, params, url: new URL(req.url) };

      const actor = await resolveActor(userId);
      const candidates = await spec.scopes(base);

      for (const scope of candidates) {
        if (explain(actor, spec.permission, scope).allowed) {
          return await handler({ ...base, actor, userId, scope });
        }
      }

      console.warn(
        "[authz] denied",
        JSON.stringify({
          userId,
          permission: spec.permission,
          candidates: candidates.length,
          reason: candidates.length ? "no candidate scope permitted" : "nothing references it",
        })
      );
      throw new Forbidden(
        spec.permission,
        candidates[0] ?? {},
        candidates.length ? "no candidate scope permitted" : "nothing references it"
      );
    } catch (err) {
      return errorResponse(err);
    }
  };
}
