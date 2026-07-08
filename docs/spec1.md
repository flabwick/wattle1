# Problem Statement: Why Chat Interfaces Fail Knowledge Work

Chat interfaces (Claude, ChatGPT, etc.) are built around a linear, turn-by-turn exchange. Knowledge work is not linear — it's iterative: building context over time, refining ideas, moving between related concepts, and transforming raw material into new output. A chat log treats every past message as equally-weighted, undifferentiated scroll. Referring back to a log is not the same activity as thinking with a tool. The interface needed instead is a **workspace**: something navigated, re-read, and restructured over time, more like a browser over your own file system than a message thread.

Current workaround: manually shuttling content between a note-taking app (Obsidian) and a chatbot. This document lays out why that's broken and what would fix it.

## 1. Context Is Frozen on Upload

Once a file is attached to a chat, it's a static snapshot. If the source document is edited afterward (e.g. revising an essay in progress), the chat has no way to reflect that — the only options are:
- Paste the new version in as an additional message, leaving the outdated version cluttering context, or
- Abandon the chat and start over, losing all prior discussion.

**Need:** context that stays live-linked to its source, so edits propagate without duplication or restarts.

## 2. Context Is Opaque

Automated systems (agent frameworks like Manus, RAG pipelines, Claude Projects) decide what source material to feed the model without surfacing that decision to the user. When the output is wrong, or reflects a source it shouldn't have, there's no way to trace which input caused it. This produces a background stress around auditing AI output.

**Need:** context assembly should be visible and built from a defined, intuitive set of user actions — automation without becoming a black box.

## 3. Switching Between Chat and Files Is High-Friction

Chat and the actual working documents live in separate apps (or, in embedded versions like Google Docs + Gemini, separate panes). Moving material between "thinking with the AI" and "editing the actual file" requires manual copy-paste. This is especially bad on mobile, where reading/writing/studying often happens without a full desktop setup.

**Need:** a single interface where chat and files are both visible, easy to switch between, and — critically — easy to move content between, including live editing of the context window while working.

## 4. No Middle Ground Between "In Context" and "In My Files"

A common workflow: reading a long passage (an article chapter, a long AI response) and generating a list of questions to test against it — sometimes all at once, sometimes one at a time with back-and-forth iteration. This requires holding scratch material — notes, questions, passages — somewhere that's neither a permanent file cluttering the vault, nor content stuffed permanently into the chat's context.

**Need:** a staging layer for loose notes, questions, and text blocks that can be selectively pulled into a prompt without permanently living in either the file system or the context window.

## 5. Bulk Multi-File Operations Are Manual Labor

AI is well-suited to merging, splitting, and reformatting documents, but every case currently requires manual assembly:
- **Merging:** e.g. combining 20 loose journal/draft notes means copy-pasting each into chat individually (upload limits are typically ~5 files per message), describing in prose what to extract/organize, then manually filing the result — often iterating in a separate document with more back-and-forth.
- **Splitting/extracting:** pulling out content relevant to a specific topic from a longer document, generating insights, and writing up the result elsewhere.
- **Formatting:** cleaning up speech-to-text transcripts or rough drafts, converting between formats (Docs → Markdown, PDF → text, web clip → Markdown). AI can do this well, but each instance requires manually re-describing the task and manually organizing inputs/outputs.

**Need:** these operations should act directly on the file system rather than being routed through copy-paste chat exchanges with repeated manual prompting.

## 6. No Persistent, Self-Organizing Structure

Standard RAG rediscovers relationships between documents from scratch on every query. There's no memory of structure.

**Need:** something closer to a self-maintaining zettelkasten — files that stay separable but interlinked, discoverable without rigid folder hierarchies. Tags and links should be inferred automatically from which files are opened together and what's asked about them, compounding over time in the background rather than rebuilt per session.

## 7. Multimodal Input (Handwriting/Speech) Is Disconnected

Standard OCR handles messy or complex handwriting poorly, but multimodal AI models do this well. Current workflow: photograph notes, run them through whichever model is cheapest (e.g. Gemini, Qwen), then manually import the output into Obsidian.

**Need:** multimodal capture (photo/speech) integrated directly into the workspace's ingestion pipeline, not a separate manual step.

---

# Part 2: System Spec

## Core Metaphor

The system works like a web browser — but instead of browsing the web, you're browsing your vault, which functions as a database. The primitives are **Pages** and **Cards**.

## Pages

A Page is the equivalent of a browser tab. Pages are where you mix and match context. Multiple Pages stack vertically in a scrolling feed, similar to how tabs can be arranged or scrolled through.

- Pages can be created, reordered, and moved.
- Pages stack on top of each other — position in the stack is meaningful (see Generation Rule below).
- You "graduate" a Page upward when you want to keep what's in it; lower Pages are for disposable, in-progress generation.

## Cards

A Card is the unit of context — the atomic building block that lives inside a Page.

- Cards can be **created** (new, blank/generated) or **opened** from the vault (an existing note/file).
- Cards can be **edited**, **deleted**, **saved** (back to the vault), and **reordered** within a Page.
- Cards are versatile: they can hold a note, a passage, a question, a draft, an AI response, a file reference — any discrete piece of content.
- The overall workflow is: generate, create, and mix-and-match Cards within Pages, and mix-and-match Pages within the stack.

## Generation Rule (Context Visibility)

When you generate content from a Card, the system reads **all Cards in Pages above it**, and **none below**. This makes context assembly directional and visible: you always know what's feeding a generation by looking at what's stacked above it. This directly solves the opacity problem from Part 1 — context is no longer a black box, it's a physical stack you can see and rearrange.

## Stacks (Sideways Substitution)

Cards within a Page can be grouped into a **Stack** — a sideways sub-interface for swapping between alternate versions of a Card in the same slot.

- Swipe or click an arrow to substitute one Card for another within the Stack.
- Click **+** within a Stack to create a new Card directly in that substitution slot.
- This is the mechanism for the "test 10 questions against one passage" workflow from Part 1 §4: each question/variant sits in the same Stack slot, and you cycle through them without duplicating the surrounding context.

## Navigation Model

- **Vertical scroll** = moving between Pages (stacked context, top = most "kept," bottom = most disposable/in-progress).
- **Horizontal swipe** = moving between Cards within a Stack (substituting alternate versions in the same slot).

## The Dock (Footer)

A sticky footer at the bottom of the screen, state-dependent:

- Tap a Card → the Dock surfaces that Card's edit functions (title, content, metadata, etc.).
- Tap again / double-tap / trigger an edit action → enters edit mode for that Card.
- The Dock is also where **generate** functions live — triggering AI generation for a Card happens from the Dock, using the Generation Rule above to determine context.

---

## Summary of Core Requirement

Merge the chat interface and the file system into one navigable workspace, where:
- Context is live and editable, not frozen on upload
- Context composition is visible and user-directed, not a black box
- Chat and files share one interface with easy bidirectional transfer
- A staging layer exists between "in context" and "in the vault"
- Merge/split/format operations run directly against the file system
- Structure (tags, links) is inferred and self-maintained over time
- Multimodal input is a native part of ingestion

---

# Part 3: MVP Spec

The full vision has a lot of moving parts. An MVP should test the **one hypothesis that matters most**: that a directional, visible stack of Cards and Pages is a better way to work with AI than a chat log. Everything else — auto-tagging, live file sync, multimodal capture, model switching — can wait until that core hypothesis is validated. If Pages/Cards doesn't feel better than chat, none of the rest matters yet.

## MVP Goal

Build the smallest version of Pages + Cards + the Generation Rule + the Dock, and use it for real — specifically, for the two workflows already described in Part 1: (a) iterating on a piece of writing, and (b) testing a set of questions against a passage. If those two workflows feel meaningfully better than your current Obsidian + chatbot setup, the core idea is validated.

## In Scope for MVP

**Vault**
- A flat list of Cards. Each Card is a title + a block of markdown text.
- Basic list view with search (title/text match). No folders, no auto-tags, no auto-linking yet.
- Create, edit, delete a Card directly from the vault view (not just from inside a Page).

**Pages**
- Create a new Page, delete a Page, reorder Pages in the vertical stack.
- A Page holds an ordered list of Cards.
- No naming/labeling required for MVP — position in the stack is enough.

**Cards inside a Page**
- Add a Card to a Page two ways: open an existing one from the vault, or create a new blank one.
- Edit a Card's text inline.
- Reorder Cards within a Page (simple drag or up/down controls — doesn't need to be fancy).
- Remove a Card from a Page (does not delete it from the vault) or delete it entirely.
- "Save" a Card back to the vault so edits persist.

**Generation Rule**
- One "Generate" action per Card. When triggered, the system sends the AI: all Cards in the current Page above this one, plus all Cards in every Page above the current Page. Nothing below.
- The response comes back as a new Card, appended directly below the one that triggered it.
- This is the single most important piece of the MVP — it's the mechanism that replaces the chat log.

**The Dock**
- Tap a Card → Dock shows: title field, edit toggle, delete, save-to-vault, generate.
- No multi-state complexity beyond "Card selected" vs. "nothing selected."

## Explicitly Out of Scope for MVP (defer to v2+)

- **Stacks (sideways substitution)** — nice-to-have but adds real UI complexity. For MVP, testing "10 questions against 1 passage" just means creating 10 separate Cards in sequence and generating from each — more clicks, but proves the underlying concept without building swipe-substitution.
- **Live-linked files / Obsidian sync** — MVP Cards are self-contained text, edited only inside the app. Getting content in/out of Obsidian is copy-paste for now.
- **Auto-tagging / self-organizing zettelkasten links** — search is manual (text match) for MVP; inferred structure comes later once there's real usage data to infer from.
- **Multimodal capture (photo/handwriting/speech)** — text in, text out only.
- **Bulk merge/split/format automation** — the Generation Rule already lets you point AI at a set of Cards and ask it to merge/reformat them via a prompt; a dedicated one-click "merge these 20" tool comes later.
- **Model selection / multiple AI providers** — one fixed model, no picker.
- **Offline support** — always-online is fine for MVP.
- **Multi-user / collaboration** — single vault, single user.

## Platform Decision for MVP

Recommend a **responsive web app**, not native mobile + desktop apps. One codebase, works in a browser on your phone (train/bed use case) and on desktop, and is by far the fastest way to get something real in your hands to test the core hypothesis. Native mobile polish can come later if the concept proves out.

## Suggested Build Order

1. Vault: Card CRUD + search (no Pages yet — just prove Cards can be created/edited/stored).
2. Pages: stacking, add/remove/reorder Cards inside a Page.
3. Generation Rule: wire up the AI call using the "everything above, nothing below" context logic.
4. Dock: consolidate edit/generate actions into the sticky footer.
5. Dogfood it on the two target workflows from Part 1 for at least a week before deciding what to build next.

## What "Done" Looks Like for the MVP

You can open the app, stack a few Pages, drop in some Cards (existing notes + new ones), hit Generate, see a new Card appear using only the context above it, edit and save a Card back to the vault — and you'd genuinely rather do your next essay-editing or passage-questioning session in this than in Obsidian + a chatbot tab.

---

# Part 4: Cross-Platform Design Notes

Since a phone browser experience now and a native phone app later are both required, the architecture should be decided up front — retrofitting this is expensive, but designing for it from day one is nearly free.

## Separate the Brain from the Face

The single most important decision: **all logic (vault, Pages, Cards, the Generation Rule, AI calls) lives behind an API — not inside the app you're clicking around in.** The web app is just one client talking to that API. This means:

- A future native phone app is a *new client* against the *same backend*, not a rewrite of the whole system.
- Card/Page/generation logic is written once and never duplicated between platforms.
- You could add a desktop app, a native app, or even a CLI later without touching the core.

Practically: build a backend (even a simple one) with endpoints for vault CRUD, Page/Card operations, and generation — and make the web frontend consume it like any other client would. Don't let business logic leak into frontend code.

## Build the Web App in a Framework That Ports Natively

Use **React**, structured so that the UI components can later be swapped for **React Native** components (or built with **React Native Web** from the start, so the *same* component code renders both in the browser and, later, natively). This is the most direct path to "quickly migrate to a phone app" — the component logic and state management are shared; only the rendering layer changes.

Alternative if you want an even faster bridge: build the web app as an installable **Progressive Web App (PWA)** first — add a manifest and basic offline shell caching so it can be "installed" to a phone home screen and run full-screen, feeling native, before any native code exists at all. This buys you a phone-app-like experience almost for free and delays the native build until you know the concept works.

## Design Mobile-First, Not Mobile-Adapted

Given the actual use case (train, bed, phone-primary), design touch interactions first and let desktop be the adapted version, not the other way around:

- **Dock stays in the thumb zone** — bottom of screen, reachable one-handed.
- **Large tap targets** on Cards — this is a touch interface first.
- **Vertical scroll is the primary gesture** (moving through Pages). Reserve horizontal swipe exclusively for Stack substitution (once built) so gestures don't conflict with each other or with normal page scroll.
- Test on an actual phone early and often — resizing a browser window is not the same as thumb-reachability and scroll feel on a real device.

## Responsive Behavior (Desktop as the Adaptation)

- **Phone:** strict single-column vertical stack of Pages, one Page's worth of Cards visible at a time, Dock pinned to bottom.
- **Desktop:** same underlying model, but with room to show more context at once — e.g. multiple Pages visible side by side, or a wider Card view — without changing the underlying data model, only the layout.
- Keep the Generation Rule and data model platform-agnostic; only the *rendering density* should change between screen sizes.

## Design System From the Start

Even for the MVP, define a small shared set of design tokens (spacing scale, touch target minimums, type scale, color roles) rather than hardcoding pixel values into components. This is what makes the later native port fast — the visual language transfers even though the underlying rendering technology changes.

## State & Data Layer — Build for Sync Even Before You Need It

You don't need offline support in the MVP, but you should structure data so adding it later doesn't require a rewrite:

- Give every Card and Page a stable ID and a last-modified timestamp from day one, even though MVP doesn't need conflict resolution yet.
- Use optimistic UI updates (update the screen immediately, confirm with the server after) rather than blocking on every network round-trip — this is both a better mobile experience now and the same pattern offline-first apps need later.
- Avoid designs that assume "always exactly one client is ever open" — even single-user, you'll likely have the phone browser and desktop browser open on the same vault at different times.

## Practical Sequencing

1. Build the backend API first, with the Vault/Page/Card/Generation logic fully decoupled from any UI.
2. Build the web frontend as a PWA against that API, mobile-first.
3. Validate the core hypothesis (Part 3) using the PWA on your actual phone, in actual train/bed conditions.
4. Only once validated, decide whether a true native app (via React Native, reusing the same component logic) is worth the extra investment over the PWA experience.