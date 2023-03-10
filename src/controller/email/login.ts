import { Context } from "hono";
import { z } from "zod";
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
  console.log("applicationInfo", applicationInfo);
  const key = `${applicationInfo?.id}:email:${email}`;
  console.log("key", key);

  const userObjId = c.env.AuthC1User.idFromName(key);
  const stub = c.env.AuthC1User.get(userObjId);
  const userClient = new UserClient(stub);

  const user = await userClient.getUser();
  console.log("user---", user);

  if (!user?.id) {
    console.log("user not found, send error");
    return handleError(userNotFound, c);
  }

  const salt = await c.env.AUTHC1_USER_DETAILS.get(user?.id);
  const passwordMatched = await verifyPassword(
    password,
    salt,
    user.password as string
  );

  if (!passwordMatched) {
    return new Response("Invalid password", { status: 401 });
  }

  const promises = await Promise.all([
    userClient.createSession(applicationInfo),
    c.env.AUTHC1_ACTIVITY_QUEUE.send({
      acitivity: "LoggedIn",
      userId: user?.id,
      applicationId: applicationInfo?.id,
      name: applicationInfo.name,
      email,
      created_at: new Date(),
    }),
  ]);

  const [authDetails] = promises;

  const { accessToken, refreshToken } = authDetails;

  return c.json({
    access_token: accessToken,
    email,
    refresh_token: refreshToken,
    expires_in: applicationInfo.settings.expires_in,
    local_id: user.id,
    name: user?.name,
  });
}
