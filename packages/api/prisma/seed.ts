import { templateSnapshotV1Schema, defaultMetadata, type TemplateSnapshotV1 } from "@wattle/shared";
import { prisma } from "../src/db.js";

/** No live database ids appear anywhere in these snapshots: they're self-contained
 *  templates, deep-copied fresh into new Cards/Pages/(Tab) on every Open. */
function noteMetadata(extra: Record<string, unknown> = {}) {
  return { ...defaultMetadata(), typeId: "note", ...extra };
}

const CORE_TEMPLATES: Array<{
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  snapshot: TemplateSnapshotV1;
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
  for (const template of CORE_TEMPLATES) {
    const snapshot = templateSnapshotV1Schema.parse(template.snapshot);
    await prisma.template.upsert({
      where: { slug: template.slug },
      update: {
        name: template.name,
        description: template.description,
        scope: snapshot.scope,
        sortOrder: template.sortOrder,
        isCore: true,
        snapshot: JSON.stringify(snapshot),
      },
      create: {
        slug: template.slug,
        name: template.name,
        description: template.description,
        scope: snapshot.scope,
        sortOrder: template.sortOrder,
        isCore: true,
        snapshot: JSON.stringify(snapshot),
      },
    });
  }
  console.log(`Seeded ${CORE_TEMPLATES.length} core Templates: ${CORE_TEMPLATES.map((t) => t.slug).join(", ")}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
