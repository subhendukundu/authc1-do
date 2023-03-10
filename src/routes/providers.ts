import { Context, Hono, Next } from "hono";
import githubCallbackController from "../controller/providers/github/callback";
import githubRedirectController from "../controller/providers/github/redirect";
import { authenticateApplication } from "../middleware/authenticateApplication";
import { generateUniqueIdWithPrefix } from "../utils/string";

const providersRoutes = new Hono();

export const sessionCookieName = "AuthC1_Session_Id";

providersRoutes.use("*", async (c: Context, next: Next) => {
  let sessionId = c.req.cookie(sessionCookieName);
  if (!sessionId) {
    sessionId = generateUniqueIdWithPrefix();
    c.cookie(sessionCookieName, sessionId);
  }
  c.set("sessionId", sessionId);
  await next();
});

providersRoutes.use("*", async (c: Context, next: Next) => {
  const applicationId = c.req.param("applicationId");
  const handler = authenticateApplication(applicationId);
  return await handler(c, next);
});

providersRoutes.get(
  "/:applicationId/github/redirect",
  githubRedirectController
);

providersRoutes.get(
  "/:applicationId/github/callback",
  githubCallbackController
);

export { providersRoutes };
