import { Router } from "express";
import * as stackService from "../services/stackService.js";

// Mounted at /api/stacks — a "stack" Card's own members and active-alternate state,
// the ad hoc structural-mutation counterpart to /api/page-cards for the Stack concept
// (registries/definitions/stackCardType.ts). Not Operation-registry actions: like
// Move/Remove-from-page, these apply the same way regardless of what a member's own
// CardType is, so there's no CardType.supportsOperations gate to route through.

export const stacksRouter = Router();

// POST /api/stacks  { pageId } — creates a new Stack at the bottom of a Page.
stacksRouter.post("/", async (req, res) => {
  const { pageId } = req.body ?? {};
  res.status(201).json(await stackService.createStackInPage(pageId));
});

// POST /api/stacks/convert  { pageCardId } — the Dock's "Make a Stack" action:
// turns an existing top-level Card into a Stack with that Card as its first member.
stacksRouter.post("/convert", async (req, res) => {
  const { pageCardId } = req.body ?? {};
  res.status(201).json(await stackService.convertCardToStack(pageCardId));
});

// POST /api/stacks/wrap  { cardId } — a `[[cardId]]` embed's own "turn into stack"
// (CardEmbed.tsx): wraps an arbitrary Card by id (no PageCard involved) as a new
// Stack's first member, leaving the original Card itself untouched everywhere else
// it's shown. Returns the new Stack Card — the caller repoints its own embed
// reference at its id.
stacksRouter.post("/wrap", async (req, res) => {
  const { cardId } = req.body ?? {};
  res.status(201).json(await stackService.wrapCardInStack(cardId));
});

// GET /api/stacks/:stackCardId — every member plus the currently active index.
stacksRouter.get("/:stackCardId", async (req, res) => {
  res.json(await stackService.getStackData(req.params.stackCardId));
});

// PUT /api/stacks/:stackCardId/active  { index } — the rail's ← / →.
stacksRouter.put("/:stackCardId/active", async (req, res) => {
  const { index } = req.body ?? {};
  const activeIndex = await stackService.setActiveIndex(req.params.stackCardId, index);
  res.json({ activeIndex });
});

// DELETE /api/stacks/:stackCardId/close — "Close Stack": removes it from the Page,
// promoting any still-unsaved member to the vault first. Member Cards themselves
// are untouched, unlike the bare DELETE below.
stacksRouter.delete("/:stackCardId/close", async (req, res) => {
  await stackService.closeStack(req.params.stackCardId);
  res.status(204).end();
});

// DELETE /api/stacks/:stackCardId — "Delete Stack": the container and every member's
// own vault Card, all at once.
stacksRouter.delete("/:stackCardId", async (req, res) => {
  await stackService.deleteStack(req.params.stackCardId);
  res.status(204).end();
});

// POST /api/stacks/:stackCardId/members — the rail's "+": appends a new blank member
// and makes it active.
stacksRouter.post("/:stackCardId/members", async (req, res) => {
  res.status(201).json(await stackService.addMember(req.params.stackCardId));
});

// PATCH /api/stacks/members/:memberId  { title?, content? } — inline-edit a member's
// draft, staged until POST .../save.
stacksRouter.patch("/members/:memberId", async (req, res) => {
  res.json(await stackService.updateMemberDraft(req.params.memberId, req.body ?? {}));
});

// POST /api/stacks/members/:memberId/save — commit a member's draft to its own vault
// Card.
stacksRouter.post("/members/:memberId/save", async (req, res) => {
  res.json(await stackService.saveMemberToVault(req.params.memberId));
});

// DELETE /api/stacks/members/:memberId — remove one member; auto-deletes the whole
// Stack if it was the last one left.
stacksRouter.delete("/members/:memberId", async (req, res) => {
  res.json(await stackService.removeMember(req.params.memberId));
});
