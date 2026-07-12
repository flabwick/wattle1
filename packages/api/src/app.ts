import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import "express-async-errors";
import { ZodError } from "zod";
import { annotationsRouter } from "./routes/annotations.js";
import { cardsRouter } from "./routes/cards.js";
import { generateRouter } from "./routes/generate.js";
import { pageCardsRouter } from "./routes/pageCards.js";
import { pagesRouter } from "./routes/pages.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/cards", cardsRouter);
  app.use("/api/pages", pagesRouter);
  app.use("/api/page-cards", pageCardsRouter);
  app.use("/api/generate", generateRouter);
  app.use("/api/annotations", annotationsRouter);

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
