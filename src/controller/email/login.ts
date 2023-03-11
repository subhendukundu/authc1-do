import { Context } from "hono";
import { z } from "zod";
import { ApplicationClient } from "../../do/AuthC1App";
import { UserClient } from "../../do/AuthC1User";
import { handleError, userNotFound } from "../../utils/error-responses";
import { checkHash } from "../../utils/hash";
import { ApplicationRequest } from "../applications/create";

export const loginSchema = z.object({
  email: z.string(),
  password: z.string(),
});

async function verifyPassword(
  password: string,
  salt: string,
  hash: string
): Promise<boolean> {
  console.log(password, salt, hash);
  const isValid = await checkHash(password, salt, hash);
  console.log(isValid);
  return isValid;
}

export async function emailLoginController(c: Context) {
  const { email, password } = await c.req.json();
  console.log("handleEmailLogin", email, password);
  const applicationInfo: ApplicationRequest = c.get("applicationInfo");
  const applicationClient = c.get("applicationClient") as ApplicationClient;

  const authDetails = await applicationClient.getUser(email, password);
  console.log("authDetails---", authDetails);
  const { accessToken, refreshToken, userData } = authDetails;

  return c.json({
    access_token: accessToken,
    email,
    refresh_token: refreshToken,
    expires_in: applicationInfo.settings.expires_in,
    local_id: userData?.id,
    name: userData?.name,
  });
}
