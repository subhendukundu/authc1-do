import jsonwebtoken from "@tsndr/cloudflare-worker-jwt";
import { Context } from "hono";
import { setUnauthorizedResponse, verify } from "../middleware/jwt";
import { generateRandomID } from "./string";

interface Payload {
  userId: string;
  expiresIn: number;
  applicationName: string;
  email: string;
  emailVerified: boolean;
  applicationId: string;
  secret: string;
  algorithm: string;
  sessionId: string;
  provider?: string;
}

interface AuthToken {
  accessToken: string;
  refreshToken: string;
}

type UserFromTokenResult =
  | {
      iss: string;
      aud: string;
      auth_time: number;
      user_id: string;
      exp: number;
      iat: number;
      email: string;
      email_verified: boolean;
      sign_in_provider: string;
    }
  | Response;

export async function createAccessToken(payload: Payload): Promise<string> {
  const {
    userId,
    applicationName,
    applicationId,
    email,
    expiresIn,
    emailVerified,
    secret,
    algorithm,
    sessionId,
    provider = "email",
  } = payload;

  // TODO: Remove sign_in_provider hardcoded value
  const accessToken = await sign(
    {
      iss: `https://authc1.com/${applicationId}`,
      aud: applicationName,
      auth_time: Date.now() / 1000,
      user_id: userId,
      exp: Math.floor(Date.now() / 1000) + expiresIn,
      iat: Math.floor(Date.now() / 1000),
      email,
      email_verified: emailVerified,
      sign_in_provider: provider,
      session_id: sessionId,
    },
    secret,
    algorithm
  );
  return accessToken;
}

export function createRefreshToken(): string {
  const refreshToken = `0x${generateRandomID()}${generateRandomID()}`;
  return refreshToken;
}

export async function createTokens(payload: Payload): Promise<AuthToken> {
  const accessToken = await createAccessToken(payload);

  const refreshToken = createRefreshToken();
  return {
    accessToken,
    refreshToken,
  };
}

export async function sign(
  payload: any,
  secret: string,
  algorithm: string = "HS256"
): Promise<string> {
  const token = await jsonwebtoken.sign(payload, secret, { algorithm });
  return token;
}

export async function getUserFromToken(
  c: Context,
  secret: string
): Promise<UserFromTokenResult> {
  const authorization = c.req.headers.get("Authorization");
  console.log("authorization", authorization);
  if (!authorization) {
    return setUnauthorizedResponse(c);
  }

  const token: string = authorization.replace(/Bearer\s+/i, "");
  const payload = await verify(c, token, secret as string);
  console.log("payload", payload);
  if (payload instanceof Response) {
    return payload;
  }

  return payload;
}
