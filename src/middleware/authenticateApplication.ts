import { Context, MiddlewareHandler, Next } from "hono";
import { ApplicationClient } from "../do/AuthC1App";
import { setUnauthorizedResponse } from "./jwt";

interface ApplicationInfo {
  applicationId: string;
  name: string;
}

export function authenticateApplication(id?: string): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const applicationId = c.req.headers.get("X-Authc1-Id") as string;
    const data = await c.env.AUTHC1_APPLICATION_PROVIDER_DETAILS.get(applicationId, { type: "json" });
    console.log("applicationInfo authenticateApplication ", data);
    if (!data?.applicationData?.id) {
      return setUnauthorizedResponse(c);
    }
    c.set("applicationInfo", data);
    await next();
  };
}
