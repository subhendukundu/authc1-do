import { Context, MiddlewareHandler, Next } from "hono";
import { ApplicationClient } from "../do/AuthC1App";
import { setUnauthorizedResponse } from "./jwt";

interface ApplicationInfo {
  applicationId: string;
  name: string;
}

function isApplicationInfo(
  applicationInfo: ApplicationInfo | Response
): applicationInfo is ApplicationInfo {
  return (applicationInfo as ApplicationInfo).applicationId !== undefined;
}

function invalidXAuthc1IdResponse(): Response {
  return new Response(
    "The application could not be authenticated, please check the provided X-Authc1-Id.",
    {
      status: 401,
      headers: {
        "content-type": "text/plain",
      },
    }
  );
}

export function authenticateApplication(id?: string): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const applicationId = c.req.headers.get("X-Authc1-Id") as string;
    const id = c.env.AuthC1App.idFromName(applicationId);
    const applicationObj = c.env.AuthC1App.get(id);
    const applicationClient = new ApplicationClient(applicationObj);
    const data = await applicationClient.get();
    console.log("applicationInfo authenticateApplication ", data);
    if (!data.id) {
      return setUnauthorizedResponse(c);
    }
    c.set("applicationInfo", data);
    await next();
  };
}
