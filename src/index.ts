import { Context, Hono, Next } from "hono";
import { authenticateApplication } from "./middleware/authenticateApplication";
import { accountsRoutes } from "./routes/accounts";
import { applicationsRoutes } from "./routes/application";
import { confirmRoutes } from "./routes/confirm";
import { loginRoutes } from "./routes/login";
import { providersRoutes } from "./routes/providers";
import { registerRoutes } from "./routes/register";
import { setupRoutes } from "./routes/setup";
import { verifyRoutes } from "./routes/verify";
import { webhookRoutes } from "./routes/webhook";
export { AuthC1App } from "./do/AuthC1App";
export { AuthC1User } from "./do/AuthC1User";
// export { AuthC1Token } from "./do/AuthC1Token";
export { AuthC1Activity } from "./do/AuthC1Activity";

type Bindings = {
  AuthC1App: DurableObjectNamespace;
  AuthC1User: DurableObjectNamespace;
  AUTHC1_USER_DETAILS: KVNamespace;
  AUTHC1_DO_USER_TOKEN_DETAILS: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

const v1Routes = new Hono<{ Bindings: Bindings }>();
const v1UnauthRoutes = new Hono<{ Bindings: Bindings }>();

v1Routes.use("*", async (ctx: Context, next: Next) => {
  const handler = authenticateApplication();
  return await handler(ctx, next);
});

app.onError((err, c) => {
  console.error(`${err}`);
  return c.text(err.message, 500);
});

app.get("/", (ctx: Context) => ctx.text("Are you sure?"));

v1Routes.route("/login", loginRoutes);
v1Routes.route("/register", registerRoutes);
v1Routes.route("/applications", applicationsRoutes);
v1Routes.route("/verify", verifyRoutes);
v1Routes.route("/confirm", confirmRoutes);
v1Routes.route("/accounts", accountsRoutes);

v1UnauthRoutes.route("/webhook", webhookRoutes);
v1UnauthRoutes.route("/providers", providersRoutes);

v1UnauthRoutes.route("/setup", setupRoutes);

app.route("/api/v1", v1UnauthRoutes);
app.route("/api/v1", v1Routes);

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async queue(batch: MessageBatch<any>, env: any) {
    console.log("-------------------------------------------------------->");
    console.log(
      JSON.stringify({
        count: batch.messages.length,
        messages: batch.messages,
      })
    );

    const promises = batch?.messages?.map((item) => {
      const { body } = item;
      console.log("queue", body);
      const { applicationId, ...rest } = body;
      const id = env.AuthC1Activity.idFromName(applicationId);
      const obj = env.AuthC1Activity.get(id);
      const json = {
        clientId: applicationId,
        ...rest,
      };
      console.log("json-----------", json);
      return obj.fetch(`http://activity/webhook/push`, {
        method: "PUT",
        body: JSON.stringify(json),
      });
    });
    await Promise.allSettled(promises);
  },
};
