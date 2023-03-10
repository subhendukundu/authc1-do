import { Context } from "hono";
import { UserClient } from "../../do/AuthC1User";
import { VerifyPayload } from "../../middleware/jwt";
import { ApplicationRequest } from "./create";

export const listApplicationController = async (c: Context) => {
  const applicationInfo = c.get("applicationInfo") as ApplicationRequest;
  const user = c.get("user") as VerifyPayload;
  const applicationId = applicationInfo?.id as string;
  const key = `${applicationId}:email:${user?.email}`;
  console.log("key", key);

  const userObjId = c.env.AuthC1User.idFromName(key);
  const stub = c.env.AuthC1User.get(userObjId);
  const userClient = new UserClient(stub);
  const userAccessData = await userClient.getAccess();

  return c.json({
    ...userAccessData,
  });
};
