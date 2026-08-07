import type { UserSettings } from "@wattle/shared";
import { prisma } from "../db.js";

/** The one and only UserSettings row — see schema.prisma's doc comment on why Home
 *  lives here instead of a Page.isHome flag. */
const SETTINGS_ID = "singleton";

function serialize(settings: { homePageId: string | null }): UserSettings {
  return { homePageId: settings.homePageId };
}

export async function getSettings(): Promise<UserSettings> {
  const settings = await prisma.userSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
  return serialize(settings);
}

/** Sets (or clears, with `null`) which Page is Home — Phase 4 of the rebuild plan:
 *  "First run: create one Home Page, open it". Doesn't validate the Page still exists
 *  beyond the FK itself (onDelete: SetNull already handles a since-deleted Home
 *  gracefully — see schema.prisma). */
export async function setHomePage(pageId: string | null): Promise<UserSettings> {
  const settings = await prisma.userSettings.upsert({
    where: { id: SETTINGS_ID },
    update: { homePageId: pageId },
    create: { id: SETTINGS_ID, homePageId: pageId },
  });
  return serialize(settings);
}
