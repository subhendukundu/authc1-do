import { Context, Hono } from "hono";
import { z } from "zod";
import {
  handleError,
  refreshTokenNotValidError,
} from "../utils/error-responses";

export const tokenSchema = z.object({
  accountId: z.string(),
  userId: z.string(),
  sessionId: z.string(),
  refreshToken: z.string(),
  createdAt: z.string().datetime(),
});

export type AuthDetials = z.infer<typeof tokenSchema>;

export class TokenClient {
  c: Context;

  constructor(c: Context) {
    this.c = c;
  }

  async createToken(
    sessionId: string,
    refreshToken: string,
    userId: string,
    appId: string
  ): Promise<AuthDetials> {
    const json = {
      accountId: appId,
      userId: userId,
      sessionId,
      refreshToken,
      createdAt: new Date().toISOString(),
    };

    await this.c.env.AUTHC1_DO_USER_TOKEN_DETAILS.put(
      refreshToken,
      JSON.stringify(json)
    );
    return json;
  }

  async updateToken(
    updateData: Partial<AuthDetials>
  ): Promise<Partial<AuthDetials>> {
    const json: Partial<AuthDetials> = {};

    if (updateData.refreshToken) {
      json.refreshToken = updateData.refreshToken;
    }

    if (updateData.sessionId) {
      json.sessionId = updateData.sessionId;
    }

    const tokenDetails = await this.c.env.AUTHC1_DO_USER_TOKEN_DETAILS.get(
      updateData.refreshToken,
      {
        type: "json",
      }
    );

    if (!tokenDetails) {
      throw new Error("REFRESH_TOKEN_NOT_VALID");
    }

    await this.c.env.AUTHC1_DO_USER_TOKEN_DETAILS.put(
      updateData.refreshToken,
      JSON.stringify({
        ...tokenDetails,
        json,
      })
    );

    return updateData;
  }

  async getToken(refreshToken: string): Promise<AuthDetials> {
    const tokenDetails = await this.c.env.AUTHC1_DO_USER_TOKEN_DETAILS.get(
      refreshToken,
      {
        type: "json",
      }
    );
    return tokenDetails;
  }
}
