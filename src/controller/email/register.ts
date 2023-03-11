import { Context } from "hono";
import { z } from "zod";
import { TokenClient } from "../../do/AuthC1Token";
import { AccessedApp, UserData } from "../../do/AuthC1User";
import { handleError, invalidPassword } from "../../utils/error-responses";
import { createHash } from "../../utils/hash";
import { ApplicationDetails } from "../../utils/kv";
import { generateUniqueIdWithPrefix } from "../../utils/string";
import { createAccessToken, createRefreshToken } from "../../utils/token";
import { ApplicationRequest } from "../applications/create";

export const registerSchema = z.object({
  name: z.string().optional(),
  email: z.string(),
  password: z.string(),
});

export const validatePassword = (
  password: string,
  passwordRegex: string
): boolean => {
  const re = new RegExp(passwordRegex);
  return re.test(password);
};

export async function emailRegistrationController(c: Context) {
  const { email, password, name } = await c.req.json();

  console.log("emailRegistrationController", name, email, password);
  const applicationInfo: ApplicationDetails = c.get("applicationInfo");
  const applicationId = applicationInfo?.applicationData?.id as string;
  console.log("applicationId", applicationId);

  const key = `${applicationId}:email:${email}`;
  const existingUser = await c.env.AUTHC1_USER_DETAILS.get(key, {
    type: "json",
  });

  if (existingUser) {
    return c.json({ message: "EMAIL_IN_USE" });
  }

  const {
    providerDetails: { password_regex: passwordRegex },
  } = applicationInfo;

  const isValidPassword = validatePassword(password, passwordRegex);

  if (passwordRegex && !isValidPassword) {
    return handleError(invalidPassword, c);
  }

  const id = generateUniqueIdWithPrefix();
  const { salt, hash } = await createHash(password as string);

  const userData: UserData = {
    id,
    applicationId: applicationInfo.applicationData.id as string,
    name,
    email,
    salt,
    password: hash,
    provider: "email",
    emailVerified: false,
    lastLoggedIn: new Date().toISOString(),
  };

  const refreshToken = createRefreshToken();
  const sessionId = generateUniqueIdWithPrefix();
  const accessToken = await createAccessToken({
    userId: id,
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
    c.env.AUTHC1_USER_DETAILS.put(
      key,
      JSON.stringify({
        userData,
      })
    ),
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
    local_id: userData.id,
    name: userData?.name,
  });
}
