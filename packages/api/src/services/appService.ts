import type {
  App,
  AppWithSnapshot,
  AppCardSnapshot,
  AppSnapshotV1,
  CreateAppInput,
  OpenAppInput,
  OpenAppResult,
  UpdateAppSnapshotInput,
} from "@wattle/shared";
import { migrateAppSnapshot, migrateMetadata } from "@wattle/shared";
import { prisma } from "../db.js";

function serializeApp(app: {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  scope: string;
  isCore: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): App {
  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    description: app.description,
    scope: app.scope as App["scope"],
    isCore: app.isCore,
    sortOrder: app.sortOrder,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  };
}

function serializeAppWithSnapshot(
  app: Parameters<typeof serializeApp>[0],
  snapshot: AppSnapshotV1,
): AppWithSnapshot {
  return { ...serializeApp(app), snapshot };
}

/** Every Card's effective title/content/metadata as it would be built into a
 *  snapshot: draft edits win over the vault Card's own committed title/content, same
 *  "what the user currently sees" convention as pageCardService.saveToVault. */
async function buildCardSnapshot(entry: {
  cardId: string;
  card: { id: string; title: string; content: string; metadata: string };
  draftTitle: string | null;
  draftContent: string | null;
}): Promise<AppCardSnapshot> {
  const metadata = migrateMetadata(JSON.parse(entry.card.metadata));
  const typeId = metadata.typeId ?? "note";
  const snapshot: AppCardSnapshot = {
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

async function buildPageCardsSnapshot(pageId: string): Promise<AppCardSnapshot[]> {
  const pageCards = await prisma.pageCard.findMany({
    where: { pageId },
    orderBy: { order: "asc" },
    include: { card: true },
  });
  return Promise.all(pageCards.map(buildCardSnapshot));
}

async function buildSnapshotFromPage(pageId: string): Promise<AppSnapshotV1> {
  return { version: 1, scope: "page", cards: await buildPageCardsSnapshot(pageId) };
}

async function buildSnapshotFromTab(tabId: string): Promise<AppSnapshotV1> {
  const pages = await prisma.page.findMany({ where: { tabId }, orderBy: { order: "asc" } });
  const snapshotPages = await Promise.all(
    pages.map(async (page) => ({ cards: await buildPageCardsSnapshot(page.id) })),
  );
  return { version: 1, scope: "tab", pages: snapshotPages };
}

/** Validates a create/update request references exactly one of Tab or Page, and
 *  builds the snapshot for it server-side — the one place either operation ever
 *  touches real Tab/Page/Card data. */
async function buildSnapshotFromReference(input: { tabId?: string; pageId?: string }): Promise<AppSnapshotV1> {
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

/** Every App, lightest fields only (no snapshot payload) — the App browser's list. */
export async function listApps(): Promise<App[]> {
  const apps = await prisma.app.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return apps.map(serializeApp);
}

export async function getApp(id: string): Promise<AppWithSnapshot | null> {
  const app = await prisma.app.findUnique({ where: { id } });
  if (!app) return null;
  return serializeAppWithSnapshot(app, migrateAppSnapshot(JSON.parse(app.snapshot)));
}

/** "Save as App" — always builds the snapshot from the referenced Tab/Page's current
 *  data, never from anything the browser sends directly. */
export async function createApp(input: CreateAppInput): Promise<AppWithSnapshot> {
  const snapshot = await buildSnapshotFromReference(input);
  const app = await prisma.app.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      scope: snapshot.scope,
      snapshot: JSON.stringify(snapshot),
    },
  });
  return serializeAppWithSnapshot(app, snapshot);
}

/** Re-saving over an existing App while editingAppId is set — rebuilds the snapshot
 *  from a (possibly different) Tab/Page reference and overwrites it in place, rather
 *  than creating a duplicate App row. */
export async function updateAppSnapshot(id: string, input: UpdateAppSnapshotInput): Promise<AppWithSnapshot> {
  const existing = await prisma.app.findUniqueOrThrow({ where: { id } });
  if (existing.isCore) {
    throw new Error("Cannot update a core App");
  }
  const snapshot = await buildSnapshotFromReference(input);
  const updated = await prisma.app.update({
    where: { id },
    data: { scope: snapshot.scope, snapshot: JSON.stringify(snapshot) },
  });
  return serializeAppWithSnapshot(updated, snapshot);
}

export async function deleteApp(id: string): Promise<void> {
  const app = await prisma.app.findUniqueOrThrow({ where: { id } });
  if (app.isCore) {
    throw new Error("Cannot delete a core App");
  }
  await prisma.app.delete({ where: { id } });
}

/** Deep-copies one snapshot Card (and, if it's a Stack, every member) into brand-new
 *  rows — never savedToVault, exactly like any other freshly added Card (see
 *  schema.prisma's Card.savedToVault doc comment), so an opened App behaves like
 *  page-local scratch content until the user explicitly saves it. */
async function instantiateCard(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  snapshot: AppCardSnapshot,
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
  cards: AppCardSnapshot[],
): Promise<void> {
  for (const [index, cardSnapshot] of cards.entries()) {
    const cardId = await instantiateCard(tx, cardSnapshot);
    await tx.pageCard.create({ data: { pageId, cardId, order: index } });
  }
}

/** "Opening" an App — instantiates a fresh, fully independent copy of its snapshot:
 *  a new Tab (scope "tab") or a new Page appended to `input.tabId` (scope "page"),
 *  with brand-new Cards/PageCards/(StackMembers) throughout. Wrapped in one
 *  transaction so a large App can never partially materialize. */
export async function openApp(id: string, input: OpenAppInput = {}): Promise<OpenAppResult> {
  const app = await prisma.app.findUniqueOrThrow({ where: { id } });
  const snapshot = migrateAppSnapshot(JSON.parse(app.snapshot));

  return prisma.$transaction(async (tx) => {
    if (snapshot.scope === "tab") {
      const rightmost = await tx.tab.aggregate({ _max: { order: true } });
      const tab = await tx.tab.create({
        data: { order: (rightmost._max.order ?? -1) + 1, title: app.name },
      });
      let lastPageId = "";
      for (const [index, pageSnapshot] of snapshot.pages.entries()) {
        const page = await tx.page.create({ data: { tabId: tab.id, order: index } });
        await instantiatePageCards(tx, page.id, pageSnapshot.cards);
        lastPageId = page.id;
      }
      return { scope: "tab" as const, tabId: tab.id, pageId: lastPageId };
    }

    if (!input.tabId) {
      throw new Error("tabId is required to open a page-scoped App");
    }
    const top = await tx.page.aggregate({ where: { tabId: input.tabId }, _max: { order: true } });
    const page = await tx.page.create({
      data: { tabId: input.tabId, order: (top._max.order ?? -1) + 1 },
    });
    await instantiatePageCards(tx, page.id, snapshot.cards);
    return { scope: "page" as const, tabId: input.tabId, pageId: page.id };
  });
}
