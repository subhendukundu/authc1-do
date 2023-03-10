import { Context } from "hono";
import { z } from "zod";

import {
  handleError,
  updateApplicationError,
  refreshTokenNotValidError,
} from "../../../utils/error-responses";
import {
  handleSuccess,
  SuccessResponse,
} from "../../../utils/success-responses";
import { sign } from "../../../middleware/jwt";
import { ApplicationRequest } from "../../applications/create";
import { TokenClient } from "../../../do/AuthC1Token";
import { UserClient } from "../../../do/AuthC1User";

export const schema = z.object({
  refresh_token: z.string(),
});

export type SessionUpdate = z.infer<typeof schema>;

export const updateAccessTokenByRefreshToken = async (c: Context) => {
  try {
    const body: SessionUpdate = await c.req.valid("json");
    const applicationInfo = c.get("applicationInfo") as ApplicationRequest;
    const { settings } = applicationInfo;
    const { refresh_token: refreshToken } = body;

    const tokenObjId = c.env.AuthC1Token.idFromName(refreshToken);
    const stub = c.env.AuthC1User.get(tokenObjId);
    const tokenClient = new TokenClient(stub);
    const tokenInfo = await tokenClient.getToken();

    if (!tokenInfo?.userId) {
      return handleError(refreshTokenNotValidError, c);
    }

    const { expires_in: expiresIn } = settings;

    const userObjId = c.env.AuthC1User.idFromName(tokenInfo.userId);
    const userStub = c.env.AuthC1User.get(userObjId);
    const userClient = new UserClient(userStub);
    const { accessToken } = await userClient.refreshToken(
      tokenInfo.sessionId,
      applicationInfo
    );

    const response: SuccessResponse = {
      message: "Session updated successfully",
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresIn,
      },
    };
    return handleSuccess(c, response);
  } catch (err: any) {
    console.log(err);

    return handleError(updateApplicationError, c, err);
  }
};

export default updateAccessTokenByRefreshToken;
