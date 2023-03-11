import { Context } from "hono";
import { z } from "zod";
import { ApplicationClient } from "../../do/AuthC1App";
import { TokenClient } from "../../do/AuthC1Token";
import { UserClient } from "../../do/AuthC1User";
import { handleError, userNotFound } from "../../utils/error-responses";
import { checkHash } from "../../utils/hash";
import { ApplicationDetails, getProviderDefaultSettings } from "../../utils/kv";
import { generateUniqueIdWithPrefix } from "../../utils/string";
import { handleSuccess, SuccessResponse } from "../../utils/success-responses";
import { createAccessToken, createRefreshToken } from "../../utils/token";
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
  const applicationInfo: ApplicationDetails = c.get("applicationInfo");
  const applicationId = applicationInfo?.applicationData?.id as string;

  const key = `${applicationId}:email:${email}`;
  const data = await c.env.AUTHC1_USER_DETAILS.get(key, {
    type: "json",
  });
  const { userData } = data;
  console.log(key, userData);

  if (!userData) {
    return c.json({ message: "NOT_FOUND" });
  }

  const salt = userData?.salt;
  const passwordMatched = await verifyPassword(
    password,
    salt,
    userData.password as string
  );

  if (!passwordMatched) {
    return c.json({ message: "INVALID_PASSWORD" });
  }

  const refreshToken = createRefreshToken();
  const sessionId = generateUniqueIdWithPrefix();
  const accessToken = await createAccessToken({
    userId: userData.id,
    expiresIn: applicationInfo.applicationData.settings.expires_in,
    applicationName: applicationInfo.applicationData.name as string,
    email,
    emailVerified: false,
    applicationId: applicationInfo.applicationData.id as string,
    secret: applicationInfo.applicationData.settings.secret,
    algorithm: applicationInfo.applicationData.settings.algorithm,
    sessionId,
  });
  const tokenClient = new TokenClient(c, applicationInfo.applicationData);

  await Promise.all([
    tokenClient.createToken(
      sessionId,
      refreshToken,
      userData.id,
      applicationInfo.applicationData.id as string
    ),
    c.env.AUTHC1_ACTIVITY_QUEUE.send({
      acitivity: "Registered",
      userId: userData?.id,
      applicationId: applicationInfo.applicationData.id,
      name: applicationInfo.applicationData.name,
      email: userData.name,
      created_at: new Date(),
    }),
  ]);

  return c.json({
    access_token: accessToken,
    email,
    refresh_token: refreshToken,
    expires_in: applicationInfo.applicationData.settings.expires_in,
    local_id: userData?.id,
    name: userData?.name,
  });
}
