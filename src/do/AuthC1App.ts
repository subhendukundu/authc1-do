import { Context, Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { Bindings } from "hono/dist/types/types";
import {
  ApplicationRequest,
  schema as applicationSchema,
} from "../controller/applications/create";

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

export type UpdateApplicationRequest = z.infer<typeof applicationUpdateschema>;
export type UpdateApplicationSettingsSchema = z.infer<
  typeof applicationSettingsUpdateSchema
>;
export type Owner = z.infer<typeof ownerSchema>;
export type CreateApp = z.infer<typeof createAppSchema>;

export class AuthC1App implements DurableObject {
  state: DurableObjectState;
  env: Bindings;
  app: Hono = new Hono();
  owners: Record<string, Owner> = {};
  appDetails: ApplicationRequest;

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
      const appDetails = await this.state.storage?.get<ApplicationRequest>(
        "appDetails"
      );
      if (owners) {
        this.owners = owners;
      }
      if (appDetails) {
        this.appDetails = appDetails;
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
  }

  async fetch(request: Request) {
    return this.app.fetch(request, this.env);
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
}
