import type {
  Template,
  TemplateWithSnapshot,
  TemplateCardSnapshot,
  TemplateSnapshotV1,
  CreateTemplateInput,
  OpenTemplateInput,
  OpenTemplateResult,
  UpdateTemplateSnapshotInput,
} from "@wattle/shared";
import { migrateTemplateSnapshot, migrateMetadata } from "@wattle/shared";
import { prisma } from "../db.js";

function serializeTemplate(template: {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  scope: string;
  isCore: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): Template {
  return {
    id: template.id,
    slug: template.slug,
    name: template.name,
    description: template.description,
    scope: template.scope as Template["scope"],
    isCore: template.isCore,
    sortOrder: template.sortOrder,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

/** Turns a bare word/phrase into something reasonable to search a Page title with —
 *  no normalization beyond trim, since Page titles aren't slugified either. */
function hubChildTitle(templateName: string, index: number, total: number): string {
  return total > 1 ? `${templateName} ${index + 1}` : templateName;
}

function serializeTemplateWithSnapshot(
  template: Parameters<typeof serializeTemplate>[0],
  snapshot: TemplateSnapshotV1,
): TemplateWithSnapshot {
  return { ...serializeTemplate(template), snapshot };
}

/** Every Card's effective title/content/metadata as it would be built into a
 *  snapshot: draft edits win over the vault Card's own committed title/content, same
 *  "what the user currently sees" convention as pageCardService.saveToVault. */
async function buildCardSnapshot(entry: {
  cardId: string;
  card: { id: string; title: string; content: string; metadata: string };
  draftTitle: string | null;
  draftContent: string | null;
}): Promise<TemplateCardSnapshot> {
  const metadata = migrateMetadata(JSON.parse(entry.card.metadata));
  const typeId = metadata.typeId ?? "note";
  const snapshot: TemplateCardSnapshot = {
    typeId,
    title: entry.draftTitle ?? entry.card.title,
    content: entry.draftContent ?? entry.card.content,
    metadata,
  };

  if (typeId === "stack") {
    const members = await prisma.stackMember.findMany({
      where: { stackCardId: entry.cardId },
      orderBy: { order: "asc" },
      include: { card: true },
    });
    snapshot.stackMembers = members.map((m) => ({
      title: m.draftTitle ?? m.card.title,
      content: m.draftContent ?? m.card.content,
      metadata: migrateMetadata(JSON.parse(m.card.metadata)),
    }));
  }

  return snapshot;
}

async function buildPageCardsSnapshot(pageId: string): Promise<TemplateCardSnapshot[]> {
  const pageCards = await prisma.pageCard.findMany({
    where: { pageId },
    orderBy: { order: "asc" },
    include: { card: true },
  });
  return Promise.all(pageCards.map(buildCardSnapshot));
}

async function buildSnapshotFromPage(pageId: string): Promise<TemplateSnapshotV1> {
  return { version: 1, scope: "page", cards: await buildPageCardsSnapshot(pageId) };
}

/** `scope: "tab"` is legacy naming (kept so existing Template rows/seed data don't
 *  need a data migration) for what the rebuild plan calls a "hub" — a set of Pages
 *  materialized together, opened as a hub Page linking out to each child Page,
 *  never as a live Tab (see schema.prisma's own Tab doc comment: Tab isn't a
 *  user-facing place any more). `tabId` here is only ever a *pre-existing* Tab row
 *  left over from before the collapse — nothing creates new ones. */
async function buildSnapshotFromTab(tabId: string): Promise<TemplateSnapshotV1> {
  const pages = await prisma.page.findMany({ where: { tabId }, orderBy: { order: "asc" } });
  const snapshotPages = await Promise.all(
    pages.map(async (page) => ({ cards: await buildPageCardsSnapshot(page.id) })),
  );
  return { version: 1, scope: "tab", pages: snapshotPages };
}

/** Validates a create/update request references exactly one of Tab or Page, and
 *  builds the snapshot for it server-side — the one place either operation ever
 *  touches real Tab/Page/Card data. */
async function buildSnapshotFromReference(input: { tabId?: string; pageId?: string }): Promise<TemplateSnapshotV1> {
  if (input.tabId && input.pageId) {
    throw new Error("Provide only one of tabId or pageId");
  }
  if (input.tabId) {
    return buildSnapshotFromTab(input.tabId);
  }
  if (input.pageId) {
    return buildSnapshotFromPage(input.pageId);
  }
  throw new Error("Provide either tabId or pageId");
}

/** Every Template, lightest fields only (no snapshot payload) — the Template
 *  browser's list. */
export async function listTemplates(): Promise<Template[]> {
  const templates = await prisma.template.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return templates.map(serializeTemplate);
}

export async function getTemplate(id: string): Promise<TemplateWithSnapshot | null> {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) return null;
  return serializeTemplateWithSnapshot(template, migrateTemplateSnapshot(JSON.parse(template.snapshot)));
}

/** "Save as Template" — always builds the snapshot from the referenced Tab/Page's
 *  current data, never from anything the browser sends directly. */
export async function createTemplate(input: CreateTemplateInput): Promise<TemplateWithSnapshot> {
  const snapshot = await buildSnapshotFromReference(input);
  const template = await prisma.template.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      scope: snapshot.scope,
      snapshot: JSON.stringify(snapshot),
    },
  });
  return serializeTemplateWithSnapshot(template, snapshot);
}

/** Re-saving over an existing Template while editingTemplateId is set — rebuilds the
 *  snapshot from a (possibly different) Tab/Page reference and overwrites it in
 *  place, rather than creating a duplicate Template row. */
export async function updateTemplateSnapshot(
  id: string,
  input: UpdateTemplateSnapshotInput,
): Promise<TemplateWithSnapshot> {
  const existing = await prisma.template.findUniqueOrThrow({ where: { id } });
  if (existing.isCore) {
    throw new Error("Cannot update a core Template");
  }
  const snapshot = await buildSnapshotFromReference(input);
  const updated = await prisma.template.update({
    where: { id },
    data: { scope: snapshot.scope, snapshot: JSON.stringify(snapshot) },
  });
  return serializeTemplateWithSnapshot(updated, snapshot);
}

export async function deleteTemplate(id: string): Promise<void> {
  const template = await prisma.template.findUniqueOrThrow({ where: { id } });
  if (template.isCore) {
    throw new Error("Cannot delete a core Template");
  }
  await prisma.template.delete({ where: { id } });
}

/** Deep-copies one snapshot Card (and, if it's a Stack, every member) into brand-new
 *  rows — never savedToVault, exactly like any other freshly added Card (see
 *  schema.prisma's Card.savedToVault doc comment), so an opened Template behaves
 *  like page-local scratch content until the user explicitly saves it. */
async function instantiateCard(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  snapshot: TemplateCardSnapshot,
): Promise<string> {
  const card = await tx.card.create({
    data: {
      title: snapshot.title,
      content: snapshot.content,
      metadata: JSON.stringify(snapshot.metadata),
      savedToVault: false,
    },
  });

  if (snapshot.typeId === "stack" && snapshot.stackMembers) {
    for (const [index, member] of snapshot.stackMembers.entries()) {
      const memberCard = await tx.card.create({
        data: {
          title: member.title,
          content: member.content,
          metadata: JSON.stringify(member.metadata),
          savedToVault: false,
        },
      });
      await tx.stackMember.create({
        data: { stackCardId: card.id, cardId: memberCard.id, order: index },
      });
    }
    // Re-clamp against the member count actually created — same rule stackService's
    // writeActiveIndex applies on every other write to this field.
    const clamped = Math.max(
      0,
      Math.min(snapshot.metadata.stack?.activeIndex ?? 0, snapshot.stackMembers.length - 1),
    );
    if (clamped !== (snapshot.metadata.stack?.activeIndex ?? 0)) {
      await tx.card.update({
        where: { id: card.id },
        data: { metadata: JSON.stringify({ ...snapshot.metadata, stack: { activeIndex: clamped } }) },
      });
    }
  }

  return card.id;
}

async function instantiatePageCards(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  pageId: string,
  cards: TemplateCardSnapshot[],
): Promise<void> {
  for (const [index, cardSnapshot] of cards.entries()) {
    const cardId = await instantiateCard(tx, cardSnapshot);
    await tx.pageCard.create({ data: { pageId, cardId, order: index } });
  }
}

/** "Opening" a Template — instantiates a fresh, fully independent copy of its
 *  snapshot, with brand-new Cards/PageCards/(StackMembers) throughout, landing on
 *  one Page to navigate straight to. Never creates a Tab (see schema.prisma's Tab
 *  doc comment): a `scope: "tab"` (legacy naming — see buildSnapshotFromTab)
 *  snapshot with more than one Page materializes as a hub Page whose own Card links
 *  out to each child, all sharing one fresh `siblingGroupId` for the optional
 *  next/prev polish — but with exactly one Page, a hub-plus-one-link is pure
 *  overhead (same "no hub needed" call the Tab-collapse migration script makes for
 *  a single-Page Tab), so that one Page is just materialized directly, titled from
 *  the Template, same as scope "page". A `scope: "page"` snapshot is always just
 *  one brand-new loose Page — neither case needs a destination Tab to be appended
 *  into any more. Wrapped in one transaction so a large Template can never
 *  partially materialize. */
export async function openTemplate(id: string, _input: OpenTemplateInput = {}): Promise<OpenTemplateResult> {
  const template = await prisma.template.findUniqueOrThrow({ where: { id } });
  const snapshot = migrateTemplateSnapshot(JSON.parse(template.snapshot));

  return prisma.$transaction(async (tx) => {
    if (snapshot.scope === "tab" && snapshot.pages.length === 1) {
      const top = await tx.page.aggregate({ _max: { order: true } });
      const page = await tx.page.create({ data: { title: template.name, order: (top._max.order ?? -1) + 1 } });
      await instantiatePageCards(tx, page.id, snapshot.pages[0].cards);
      return { scope: "tab" as const, pageId: page.id };
    }

    if (snapshot.scope === "tab") {
      const top = await tx.page.aggregate({ _max: { order: true } });
      let nextOrder = (top._max.order ?? -1) + 1;
      const siblingGroupId = `hub-${id}-${Date.now()}`;

      const hub = await tx.page.create({
        data: { title: template.name, order: nextOrder++, siblingGroupId, orderInGroup: 0 },
      });

      const childPages = await Promise.all(
        snapshot.pages.map(async (pageSnapshot, index) => {
          const child = await tx.page.create({
            data: {
              title: hubChildTitle(template.name, index, snapshot.pages.length),
              order: nextOrder++,
              siblingGroupId,
              orderInGroup: index + 1,
            },
          });
          await instantiatePageCards(tx, child.id, pageSnapshot.cards);
          return child;
        }),
      );

      const linksHtml = childPages
        .map((p) => `<p><wattle-page-link data-page-id="${p.id}" data-title="${p.title ?? ""}"></wattle-page-link></p>`)
        .join("");
      const hubCard = await tx.card.create({
        data: { title: template.name, content: linksHtml, savedToVault: false },
      });
      await tx.pageCard.create({ data: { pageId: hub.id, cardId: hubCard.id, order: 0 } });
      await tx.pageLink.createMany({
        data: childPages.map((p) => ({ sourcePageId: hub.id, targetPageId: p.id })),
      });

      return { scope: "tab" as const, pageId: hub.id };
    }

    const top = await tx.page.aggregate({ _max: { order: true } });
    const page = await tx.page.create({ data: { order: (top._max.order ?? -1) + 1 } });
    await instantiatePageCards(tx, page.id, snapshot.cards);
    return { scope: "page" as const, pageId: page.id };
  });
}
