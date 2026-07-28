import { appSnapshotV1Schema, defaultMetadata, type AppSnapshotV1 } from "@wattle/shared";
import { prisma } from "../src/db.js";

/** No live database ids appear anywhere in these snapshots: they're self-contained
 *  templates, deep-copied fresh into new Cards/Pages/(Tab) on every Open. */
function noteMetadata(extra: Record<string, unknown> = {}) {
  return { ...defaultMetadata(), typeId: "note", ...extra };
}

const CORE_APPS: Array<{
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  snapshot: AppSnapshotV1;
}> = [
  {
    slug: "blank",
    name: "Blank",
    description: "An empty page.",
    sortOrder: 0,
    snapshot: {
      version: 1,
      scope: "page",
      cards: [],
    },
  },
  {
    slug: "note",
    name: "Note",
    description: "A single blank note card.",
    sortOrder: 1,
    snapshot: {
      version: 1,
      scope: "page",
      cards: [
        {
          typeId: "note",
          title: "",
          content: "",
          metadata: noteMetadata(),
        },
      ],
    },
  },
  {
    slug: "chat",
    name: "Chat",
    description: "A hidden instructional card stacked above a blank note — use Generate to chat.",
    sortOrder: 2,
    snapshot: {
      version: 1,
      scope: "tab",
      pages: [
        {
          cards: [
            {
              typeId: "note",
              title: "System Prompt",
              content:
                "You are a helpful assistant. Respond conversationally and concisely to the message below.",
              metadata: noteMetadata({ hidden: true }),
            },
            {
              typeId: "note",
              title: "",
              content: "",
              metadata: noteMetadata(),
            },
          ],
        },
      ],
    },
  },
];

async function main() {
  for (const app of CORE_APPS) {
    const snapshot = appSnapshotV1Schema.parse(app.snapshot);
    await prisma.app.upsert({
      where: { slug: app.slug },
      update: {
        name: app.name,
        description: app.description,
        scope: snapshot.scope,
        sortOrder: app.sortOrder,
        isCore: true,
        snapshot: JSON.stringify(snapshot),
      },
      create: {
        slug: app.slug,
        name: app.name,
        description: app.description,
        scope: snapshot.scope,
        sortOrder: app.sortOrder,
        isCore: true,
        snapshot: JSON.stringify(snapshot),
      },
    });
  }
  console.log(`Seeded ${CORE_APPS.length} core Apps: ${CORE_APPS.map((a) => a.slug).join(", ")}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
