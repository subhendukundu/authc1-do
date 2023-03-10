import { Context } from "hono";
import { z } from "zod";
import { ApplicationClient, AuthC1App } from "../../do/AuthC1App";
import { AccessedApp, UserClient } from "../../do/AuthC1User";
import {
  createApplicationError,
  handleError,
  unauthorizedError,
} from "../../utils/error-responses";
import { storeProviderSettings } from "../../utils/kv";
import {
  generateRandomID,
  generateUniqueIdWithPrefix,
} from "../../utils/string";
import { handleSuccess, SuccessResponse } from "../../utils/success-responses";
import { getUserFromToken } from "../../utils/token";

export const applicationSettingsSchema = z
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
  .default({});

export const schema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  settings: applicationSettingsSchema,
});

export type ApplicationRequest = z.infer<typeof schema>;
export type ApplicationSettingsSchema = z.infer<
  typeof applicationSettingsSchema
>;

export const createApplicationController = async (c: Context) => {
  try {
    const applicationInfo: ApplicationRequest = c.get("applicationInfo");
    const body: ApplicationRequest = await c.req.valid("json");
    const { name } = body;
    const applicationId = generateUniqueIdWithPrefix();
    const id = c.env.AuthC1App.idFromName(applicationId);
    const applicationObj = c.env.AuthC1App.get(id);
    const appClient = new ApplicationClient(applicationObj);

    const payload = await getUserFromToken(c, applicationInfo.settings.secret);

    if (payload instanceof Response) {
      return payload;
    }

    const key = `${applicationInfo?.id}:${payload.sign_in_provider}:${payload?.email}`;

    console.log("key", key);

    const userObjId = c.env.AuthC1User.idFromName(key);
    const stub = c.env.AuthC1User.get(userObjId);

    const userClient = new UserClient(stub);
    const user = await userClient.getUser();

    console.log("creating application with", user);

    if (!user?.id) {
      return handleError(unauthorizedError, c);
    }
    await appClient.create(
      {
        id: applicationId,
        ...body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: user.id,
        name: user.name,
        email: user.name,
        invited: false,
      }
    );
    await storeProviderSettings(c, applicationId);
    console.log("application has been created with id", body);

    await userClient.setAccess(
      {
        id: applicationId,
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accessType: "owner",
      } as AccessedApp,
      applicationInfo
    );

    const response: SuccessResponse = {
      message: "Application created successfully",
      data: {
        id: applicationId,
        name,
      },
    };
    return handleSuccess(c, response);
  } catch (err: any) {
    console.log(err);
    return handleError(createApplicationError, c, err);
  }
};
