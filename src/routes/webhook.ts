import { Hono } from "hono";
import listenController from "../controller/applications/activities/listen";

const webhookRoutes = new Hono();

webhookRoutes.get("/applications/:applicationId/listen", listenController);

export { webhookRoutes };
