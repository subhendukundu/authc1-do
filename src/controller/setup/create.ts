import { Context } from "hono";
import { z } from "zod";
import { ApplicationClient } from "../../do/AuthC1App";
import { AccessedApp, UserClient, UserData } from "../../do/AuthC1User";
import { createHash } from "../../utils/hash";
import { storeApplication, storeProviderSettings } from "../../utils/kv";
import {
  generateRandomID,
  generateUniqueIdWithPrefix,
} from "../../utils/string";

export const schema = z.object({
  name: z.string(),
  email: z.string(),
  password: z.string(),
  settings: z
    .object({
      expires_in: z.number().default(86400),
      secret: z.string().default(() => generateRandomID() + generateRandomID()),
      algorithm: z.string().default("HS256"),
      redirect_uri: z.string().optional(),
      two_factor_authentication: z.coerce.string().optional(),
      allow_multiple_accounts: z.coerce.boolean().optional(),
      session_expiration_time: z.number().default(3600),
      account_deletion_enabled: z.coerce.string().optional(),
      failed_login_attempts: z.number().optional(),
    })
    .default({}),
});

type ApplicationRequest = z.infer<typeof schema>;

export const setupApplicationController = async (c: Context) => {
  const body: ApplicationRequest = await c.req.valid("json");
  const { name, email, password, settings } = body;

  const applicationId = generateUniqueIdWithPrefix();
  const userId = generateUniqueIdWithPrefix();

  const { salt, hash } = await createHash(password);

  const userData: UserData = {
    id: userId,
    applicationId,
    name,
    email,
    password: hash,
    provider: "email",
    emailVerified: false,
    salt,
  };

  console.log("userData", userData);

  const appData = {
    id: applicationId,
    name,
    settings,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const key = `${applicationId}:email:${email}`;

  await Promise.all([
    storeApplication(c, applicationId, appData),
    c.env.AUTHC1_USER_DETAILS.put(
      key,
      JSON.stringify({
        userData,
        apps: {
          [applicationId]: {
            id: applicationId,
            name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            accessType: "owner",
          } as AccessedApp,
        },
        sessions: {},
      })
    ),
  ]);
  return c.json({
    applicationId,
    userId: userData?.id,
  });
};
