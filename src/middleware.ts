import { defineMiddleware } from "astro:middleware";
import { security } from "@runtime";
import { authorizeOwner } from "./application/authentication";
import { AppError } from "./domain/model";
import { handle } from "./server/http";
import { sessionCookie } from "./server/security";

export const onRequest = defineMiddleware(async (context, next) => {
  let protectedResource = false;
  const response = await handle(async () => {
    let path: string;
    try {
      path = decodeURIComponent(context.url.pathname);
    } catch {
      throw new AppError("invalidRequest");
    }
    protectedResource = path === "/" || path.startsWith("/api/");
    if (protectedResource) {
      const { auth, origin } = security();
      if (context.url.origin !== origin)
        throw new AppError("authConfiguration", 503);
      if (!["GET", "HEAD", "OPTIONS"].includes(context.request.method)) {
        if (
          context.request.headers.get("origin") !== origin ||
          context.request.headers.get("sec-fetch-site") === "cross-site"
        )
          throw new AppError("invalidRequest", 403);
      }
      const token = context.cookies.get(sessionCookie)?.value;
      if (path.startsWith("/api/") && path !== "/api/auth")
        authorizeOwner(await auth.identity(token));
      if (path === "/") context.locals.auth = await auth.status(token);
    }
    return next();
  });
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  if (context.url.protocol === "https:")
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
  if (protectedResource) response.headers.set("Cache-Control", "no-store");
  return response;
});
