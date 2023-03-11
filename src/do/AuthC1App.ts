import { Context, Hono } from "hono";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";

import { Bindings } from "hono/dist/types/types";
import {
  ApplicationRequest,
  schema as applicationSchema,
} from "../controller/applications/create";
import {
  emailInUse,
  handleError,
  invalidPassword,
  registrationError,
} from "../utils/error-responses";
import { getApplicationProviderSettings } from "../utils/application";
import { validatePassword } from "../controller/email/register";
import { generateUniqueIdWithPrefix } from "../utils/string";
import { checkHash, createHash } from "../utils/hash";
import { createAccessToken, createRefreshToken } from "../utils/token";
import { AuthDetials, TokenClient } from "./AuthC1Token";

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

export const ownerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  invited: z.boolean(),
});

const createAppSchema = z.object({
  app: applicationSchema,
  owner: ownerSchema,
});

export const applicationSettingsUpdateSchema = z
  .object({
    expires_in: z.number().optional(),
    secret: z.string().optional(),
    algorithm: z.string().optional(),
    redirect_uri: z.string().optional(),
    two_factor_authentication: z.coerce.string().optional(),
    allow_multiple_accounts: z.coerce.boolean().optional(),
    session_expiration_time: z.number().optional(),
    account_deletion_enabled: z.coerce.string().optional(),
    failed_login_attempts: z.number().optional(),
    allow_registration: z.boolean().optional(),
  })
  .optional();

export const applicationUpdateschema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  updatedAt: z.date().default(new Date()),
  settings: applicationSettingsUpdateSchema,
});

export const schema = z.object({
  id: z.string(),
  applicationId: z.string(),
  name: z.string(),
  email: z.string().email(),
  password: z.string().optional(),
  provider: z.string(),
  emailVerified: z.boolean().default(false),
  avatarUrl: z.string().optional(),
  providerUserId: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  lastLogin: z.string().datetime().optional(),
});

export const sessionSchema = z.object({
  sessionId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  emailVerifyCode: z.string().optional(),
  phoneVerifyCode: z.string().optional(),
  expirationTimestamp: z.number().optional(),
  createdAt: z.string().datetime(),
});

export type SessionData = z.infer<typeof sessionSchema>;

export type UpdateApplicationRequest = z.infer<typeof applicationUpdateschema>;
export type UpdateApplicationSettingsSchema = z.infer<
  typeof applicationSettingsUpdateSchema
>;

export type Owner = z.infer<typeof ownerSchema>;
export type CreateApp = z.infer<typeof createAppSchema>;
export type UserData = z.infer<typeof schema>;

export type AuthResponse = {
  accessToken?: string;
  refreshToken?: string;
  message?: string;
  userData?: UserData;
};

export class AuthC1App implements DurableObject {
  state: DurableObjectState;
  env: Bindings;
  app: Hono = new Hono();
  owners: Record<string, Owner> = {};
  appDetails: ApplicationRequest;
  users: Record<string, UserData> = {};
  sessions: Record<string, SessionData> = {};

  constructor(
    state: DurableObjectState,
    env: Bindings,
    appDetails: ApplicationRequest
  ) {
    this.state = state;
    this.env = env;
    this.appDetails = { ...appDetails };
    this.state.blockConcurrencyWhile(async () => {
      const owners = await this.state.storage?.get<Record<string, Owner>>(
        "owners"
      );

      const users = await this.state.storage?.get<Record<string, UserData>>(
        "users"
      );

      const appDetails = await this.state.storage?.get<ApplicationRequest>(
        "appDetails"
      );

      const sessions = await this.state.storage?.get<
        Record<string, SessionData>
      >("sessions");

      if (owners) {
        this.owners = owners;
      }

      if (appDetails) {
        this.appDetails = appDetails;
      }

      if (sessions) {
        this.sessions = sessions;
      }

      if (users) {
        this.users = users;
      }
    });

    this.app.post("/", async (c: Context) => {
      const appData: CreateApp = await c.req.json();
      console.log("appData----------", appData);
      const { app, owner } = appData;
      const details = {
        ...this.appDetails,
        ...app,
      };
      this.appDetails = details;
      await this.state.storage?.put("appDetails", details);
      await this.state.storage?.put("owners", {
        [owner?.id]: {
          ...owner,
        },
      });
      return c.json({
        ...this.appDetails,
      });
    });

    this.app.patch("/", async (c: Context) => {
      try {
        const appData: ApplicationRequest = await c.req.json();
        const { settings } = appData;
        console.log("appData----------", appData);
        const details = {
          ...this.appDetails,
          ...appData,
          settings: {
            ...this.appDetails.settings,
            ...settings,
          },
        };
        this.appDetails = details;
        await this.state.storage?.put("appDetails", details);
        return c.json({
          ...this.appDetails,
        });
      } catch (e) {
        console.log(e);
        throw e;
      }
    });

    this.app.get("/", async (c: Context) => {
      return c.json({
        ...this.appDetails,
      });
    });

    this.app.patch("/owner", async (c: Context) => {
      const owner: Owner = await c.req.json();
      console.log("owner----------", owner);
      this.owners[owner.id] = owner;
      await this.state.storage?.put("owners", this.owners);
      return c.json(owner);
    });

    this.app.post("/user", async (c: Context) => {
      const user: UserData = await c.req.json();
      const existingUser = this.getUser(user.email, "email");
      console.log("existingUser", existingUser);
      if (existingUser) {
        return c.json({ message: "EMAIL_IN_USE" });
      }
      const { password_regex: passwordRegex } =
        await getApplicationProviderSettings(c, this.appDetails.id as string);

      const isValidPassword = validatePassword(
        user.password as string,
        passwordRegex
      );

      if (passwordRegex && !isValidPassword) {
        return handleError(invalidPassword, c);
      }

      const id = generateUniqueIdWithPrefix();
      const { salt, hash } = await createHash(user.password as string);

      const userData: UserData = {
        id,
        applicationId: this.appDetails.id as string,
        name: user.name,
        email: user.email,
        password: hash,
        provider: "email",
        emailVerified: false,
      };

      const refreshToken = createRefreshToken();
      const sessionId = generateUniqueIdWithPrefix();
      const accessToken = await createAccessToken({
        userId: user.id,
        expiresIn: this.appDetails.settings.expires_in,
        applicationName: this.appDetails.name as string,
        email: user.email,
        emailVerified: user.emailVerified,
        applicationId: this.appDetails.id as string,
        secret: this.appDetails.settings.secret,
        algorithm: this.appDetails.settings.algorithm,
        sessionId,
      });
      console.log("accessToken, refreshToken", accessToken, refreshToken);
      this.sessions = {
        ...this.sessions,
        [sessionId]: {
          sessionId,
          accessToken,
          refreshToken,
          createdAt: new Date().toISOString(),
        },
      };
      await Promise.all([
        this.state.storage?.put("users", {
          ...this.users,
          [id]: {
            ...userData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
        c.env.AUTHC1_USER_DETAILS.put(id, salt),
        this.state.storage?.put("sessions", this.sessions),
        c.env.AUTHC1_ACTIVITY_QUEUE.send({
          acitivity: "Registered",
          userId: userData?.id,
          applicationId: this.appDetails.id,
          name: this.appDetails.name,
          email: userData.name,
          created_at: new Date(),
        }),
      ]);
      return c.json({
        accessToken,
        refreshToken,
        userData,
      });
    });

    this.app.get("/user", async (c: Context) => {
      const { email, password } = c.req.query();
      const existingUser = this.getUser(email, "email");
      if (!existingUser) {
        return c.json({ message: "USER_NOT_FOUND" });
      }
      const salt = await c.env.AUTHC1_USER_DETAILS.get(existingUser?.id);
      const passwordMatched = await verifyPassword(password, salt, existingUser.password as string);

      if (!passwordMatched) {
        return c.json({ message: "INVALID_PASSWORD" });
      }

      const authDetails = await this.createSession(existingUser, c);

      return c.json(authDetails);
    });
  }

  async fetch(request: Request) {
    return this.app.fetch(request, this.env);
  }

  getUser(email: string, provider: string): UserData | undefined {
    const user = Object.values(this.users).find(
      (user) => user.email === email && user.provider === provider
    );
    return user;
  }

  async createSession(userData: UserData, c: Context) {
    const sessionId = generateUniqueIdWithPrefix();
    const refreshToken = createRefreshToken();
    const accessToken = await createAccessToken({
      userId: userData.id,
      expiresIn: this.appDetails.settings.expires_in,
      applicationName: this.appDetails.name as string,
      email: userData.email,
      emailVerified: userData.emailVerified,
      applicationId: this.appDetails.id as string,
      secret: this.appDetails.settings.secret,
      algorithm: this.appDetails.settings.algorithm,
      sessionId,
    });
    const sessionData = {
      sessionId,
      accessToken,
      refreshToken,
      createdAt: new Date().toISOString(),
    };
    this.sessions[sessionId] = sessionData;
    const tokenClient = new TokenClient(c);
    await Promise.all([
      this.state.storage?.put("sessions", this.sessions),
      tokenClient.createToken(
        sessionId,
        refreshToken,
        userData.id,
        this.appDetails.id as string
      ),
      c.env.AUTHC1_ACTIVITY_QUEUE.send({
        acitivity: "LoggedIn",
        userId: userData?.id,
        applicationId: this.appDetails?.id,
        name: userData.name,
        email: userData.email,
        created_at: new Date(),
      }),
    ]);
    return {
      accessToken,
      refreshToken,
      userData,
    };
  }
}

export class ApplicationClient {
  app: DurableObjectStub;

  constructor(app: DurableObjectStub) {
    this.app = app;
  }

  async get(): Promise<ApplicationRequest> {
    const res = await this.app.fetch(`http://app/`);
    const data: ApplicationRequest = await res.json();
    return data;
  }

  async create(
    app: ApplicationRequest,
    owner: Owner
  ): Promise<ApplicationRequest> {
    try {
      console.log("app, owner", app, owner);
      const res = await this.app.fetch("http://app/", {
        method: "POST",
        body: JSON.stringify({ app, owner }),
      });
      const data: ApplicationRequest = await res.json();
      return data;
    } catch (e) {
      console.log("create", e);
      throw e;
    }
  }

  async update(payload: UpdateApplicationRequest): Promise<ApplicationRequest> {
    const res = await this.app.fetch("http://app/", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    const data: ApplicationRequest = await res.json();
    return data;
  }

  async setOwner(payload: Owner): Promise<Owner> {
    const res = await this.app.fetch("http://app/owner", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    const data: Owner = await res.json();
    return data;
  }

  async createUser(
    json: Partial<UserData>,
    c: Context
  ): Promise<AuthResponse | Response> {
    console.log("createUser json", json);
    const res = await this.app.fetch(`http://app/user`, {
      method: "POST",
      body: JSON.stringify(json),
    });
    const data: AuthResponse = await res.json();
    if (data.message === "EMAIL_IN_USE") {
      return handleError(emailInUse, c);
    }
    return data;
  }

  async getUser(email: string, password: string): Promise<AuthResponse> {
    const res = await this.app.fetch(
      `http://app/user?email=${email}&password=${password}`
    );
    const data: AuthResponse = await res.json();
    return data;
  }
}
