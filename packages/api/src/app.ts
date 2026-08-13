import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import "express-async-errors";
import { ZodError } from "zod";
import { actionScriptsRouter } from "./routes/actionScripts.js";
import { agentRouter } from "./routes/agent.js";
import { annotationsRouter } from "./routes/annotations.js";
import { templatesRouter } from "./routes/templates.js";
import { cardsRouter } from "./routes/cards.js";
import { dockCardsRouter } from "./routes/dockCards.js";
import { generateRouter } from "./routes/generate.js";
import { historyRouter } from "./routes/history.js";
import { nearbyRouter } from "./routes/nearby.js";
import { pageCardsRouter } from "./routes/pageCards.js";
import { pagesRouter } from "./routes/pages.js";
import { richTextImagesRouter } from "./routes/richTextImages.js";
import { searchRouter } from "./routes/search.js";
import { settingsRouter } from "./routes/settings.js";
import { stacksRouter } from "./routes/stacks.js";

export function createApp() {
  const app = express();

  app.use(cors());
  // express.json()'s own default cap is 100kb — comfortably enough for ordinary
  // Card edits, but a full-page web extract (searchCardType.ts's "export selected
  // results" action, converted from Tavily's /extract markdown into HTML) routinely
  // runs well past that on its own. 10mb is generous headroom for even a long
  // article, not a real DoS concern for a single-user local app.
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/templates", templatesRouter);
  app.use("/api/cards", cardsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/pages", pagesRouter);
  app.use("/api/page-cards", pageCardsRouter);
  app.use("/api/stacks", stacksRouter);
  app.use("/api/dock-cards", dockCardsRouter);
  app.use("/api/generate", generateRouter);
  app.use("/api/history", historyRouter);
  app.use("/api/agent", agentRouter);
  app.use("/api/nearby", nearbyRouter);
  app.use("/api/annotations", annotationsRouter);
  app.use("/api/rich-text-images", richTextImagesRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/action-scripts", actionScriptsRouter);

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.issues.map((i) => i.message).join(", ") });
    }
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  };
  app.use(errorHandler);

  return app;
}
