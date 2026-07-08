import { Router } from "express";
import * as cardService from "../services/cardService.js";

export const cardsRouter = Router();

// GET /api/cards?q=search+term — vault list + search (title/text match).
cardsRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  res.json(await cardService.listCards(q));
});

cardsRouter.get("/:id", async (req, res) => {
  const card = await cardService.getCard(req.params.id);
  if (!card) return res.status(404).json({ error: "Card not found" });
  res.json(card);
});

cardsRouter.post("/", async (req, res) => {
  const { title, content } = req.body ?? {};
  if (typeof title !== "string" || typeof content !== "string") {
    return res.status(400).json({ error: "title and content are required strings" });
  }
  res.status(201).json(await cardService.createCard({ title, content }));
});

cardsRouter.patch("/:id", async (req, res) => {
  const { title, content } = req.body ?? {};
  res.json(await cardService.updateCard(req.params.id, { title, content }));
});

cardsRouter.delete("/:id", async (req, res) => {
  await cardService.deleteCard(req.params.id);
  res.status(204).end();
});
