/**
 * One-time migration (Pages + Links + Search rebuild, Phase 3 "Collapse Tabs"): turns
 * every pre-rebuild Tab's Page stack into Pages a user can actually navigate to
 * without Tab as a concept.
 *
 * - A Tab with exactly one Page: no hub needed — that Page just inherits the Tab's
 *   title, but only if it doesn't already have one of its own *and* the Tab's title
 *   was an actual user choice (see meaningfulTabTitle below) — a Page is allowed to
 *   start untitled (schema.prisma's own doc comment), so there's no reason to force
 *   a name onto one just because the Tab it came from had an auto-generated one.
 * - A Tab with several Pages: a new hub Page (titled from the Tab, if meaningful;
 *   left untitled otherwise), containing one Card with a `wattle-page-link` to each
 *   former stack-mate, in order. All of them (hub + children) share a fresh
 *   `siblingGroupId` so the optional next/prev trail (Phase 3's "polish only") still
 *   works.
 *
 * Every migrated Page's `tabId` is cleared afterward — see schema.prisma's Tab doc
 * comment: Tab is vestigial from this point on, kept only so this script has
 * something to read. Idempotent-ish: pages with `tabId: null` are skipped, so
 * running this twice is a no-op the second time.
 *
 * Run once via `npx tsx scripts/migrateTabsToHubs.ts` from packages/api.
 */
import { prisma } from "../src/db.js";

/** tabService.ts (deleted — see schema.prisma's Tab doc comment) used to default an
 *  unnamed Tab's title to exactly `Tab ${n}` — a slot label, never something the user
 *  actually chose. Carrying that string forward as a Page's title would just replace
 *  one meaningless default ("Tab 1") with another; null (untitled, a valid state) is
 *  what "the Tab was never actually named" should become instead. */
function meaningfulTabTitle(title: string): string | null {
  const trimmed = title.trim();
  if (trimmed === "" || /^Tab \d+$/.test(trimmed)) return null;
  return trimmed;
}

async function main() {
  const tabs = await prisma.tab.findMany({
    orderBy: { order: "asc" },
    include: { pages: { where: { tabId: { not: null } }, orderBy: { order: "asc" } } },
  });

  let firstLandingPageId: string | null = null;

  for (const tab of tabs) {
    const pages = tab.pages;
    if (pages.length === 0) continue;

    const meaningfulTitle = meaningfulTabTitle(tab.title);

    if (pages.length === 1) {
      const page = pages[0];
      if (!page.title && meaningfulTitle) {
        await prisma.page.update({ where: { id: page.id }, data: { title: meaningfulTitle, tabId: null } });
      } else {
        await prisma.page.update({ where: { id: page.id }, data: { tabId: null } });
      }
      firstLandingPageId ??= page.id;
      console.log(`[migrate] Tab "${tab.title}" (1 page) -> Page ${page.id}, tabId cleared`);
      continue;
    }

    const top = await prisma.page.aggregate({ _max: { order: true } });
    const siblingGroupId = `tab-${tab.id}`;

    const hub = await prisma.page.create({
      data: {
        title: meaningfulTitle,
        order: (top._max.order ?? -1) + 1,
        siblingGroupId,
        orderInGroup: 0,
      },
    });

    await Promise.all(
      pages.map((page, index) =>
        prisma.page.update({
          where: { id: page.id },
          data: { tabId: null, siblingGroupId, orderInGroup: index + 1 },
        }),
      ),
    );

    const linksHtml = pages
      .map((p) => `<p><wattle-page-link data-page-id="${p.id}" data-title="${p.title ?? ""}"></wattle-page-link></p>`)
      .join("");
    const hubCard = await prisma.card.create({
      data: { title: meaningfulTitle ?? "", content: linksHtml, savedToVault: false },
    });
    await prisma.pageCard.create({ data: { pageId: hub.id, cardId: hubCard.id, order: 0 } });
    await prisma.pageLink.createMany({
      data: pages.map((p) => ({ sourcePageId: hub.id, targetPageId: p.id })),
    });

    firstLandingPageId ??= hub.id;
    console.log(`[migrate] Tab "${tab.title}" (${pages.length} pages) -> hub Page ${hub.id}`);
  }

  // Any Page created after the rebuild landed (tabId already null) with no Tab to
  // migrate from — nothing to do for those, they're already loose Pages.

  const settings = await prisma.userSettings.findUnique({ where: { id: "singleton" } });
  if (!settings?.homePageId && firstLandingPageId) {
    await prisma.userSettings.upsert({
      where: { id: "singleton" },
      update: { homePageId: firstLandingPageId },
      create: { id: "singleton", homePageId: firstLandingPageId },
    });
    console.log(`[migrate] Home set to ${firstLandingPageId} (was unset)`);
  }

  console.log("[migrate] done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
