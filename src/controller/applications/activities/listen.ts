import { Context, Hono } from "hono";

const listenController = async (c: Context) => {
  const applicationId = c.req.param("applicationId");
  const id = c.env.AuthC1Activity.idFromName(applicationId);
  const obj = c.env.AuthC1Activity.get(id);
  console.log("c.req.url", c.req.url);
  const resp = await obj.fetch(c.req);

  if (resp.status === 404) {
    return c.text("404 Not Found", 404);
  }

  return resp;
};

export default listenController;
