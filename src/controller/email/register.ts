import { Context } from "hono";
import { z } from "zod";
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
  const applicationInfo: ApplicationRequest = c.get("applicationInfo");
  const applicationClient = c.get("applicationClient");
  const applicationId = applicationInfo.id as string;
  console.log("applicationId", applicationId);

  const authDetails = await applicationClient.createUser({
    email,
    password,
    name,
  }, c);

  if (authDetails instanceof Response) {
    return authDetails;
  }

  const { accessToken, refreshToken, userData } = authDetails;

  console.log("accessToken----", authDetails);


  return c.json({
    access_token: accessToken,
    email,
    refresh_token: refreshToken,
    expires_in: applicationInfo.settings.expires_in,
    local_id: userData.id,
    name: userData?.name,
  });
}
