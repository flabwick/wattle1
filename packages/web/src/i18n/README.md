# i18n

A minimal flat-key translation layer — no plural rules, no interpolation, no locale
detection, no external library. Just enough to keep user-facing strings out of
components and in one place, mirroring the pattern in
[`packages/shared/src/registries/README.md`](../../../shared/src/registries/README.md)
(a lookup by key, registered once, used everywhere).

## What's here

- `en.json` — the (currently only) locale file: a flat `{ "key": "display text" }`
  map. Keys are dot-namespaced by the component/area they belong to
  (`dock.action.save`, `vault.searchPlaceholder`, `common.untitled`, ...) — `common.*`
  is for strings genuinely shared across components (e.g. the "Untitled" fallback used
  by the Dock, Card, and Vault views).
- `index.ts` — `t(key)` and `useTranslation()`. `t()` looks the key up in the current
  locale's JSON and returns it, falling back to the key itself if missing (so a typo'd
  or not-yet-translated key is visibly wrong in the UI instead of silently blank).
  `useTranslation()` just returns `{ t }` — it exists so call sites already look like
  what a real i18n library's hook would look like, in case this needs to grow
  locale-switching state later without every call site changing shape.

There's no locale switcher yet — `index.ts`'s `currentLocale` is fixed to `"en"`.

## Adding a new locale

1. Create `<locale-code>.json` (e.g. `es.json`) with the **same keys** as `en.json` —
   copy `en.json` and translate the values, don't invent new keys or drop existing
   ones (a missing key falls back to showing the raw key string, which is a bug, not a
   graceful degradation).
2. Add it to the `locales` map in `index.ts`:
   ```ts
   import es from "./es.json";
   const locales = { en, es } as const;
   ```
3. Wire up a way to choose it — `currentLocale` is a plain variable today; turning it
   into user-selectable state (e.g. a `useState` + context, or reading
   `navigator.language`) is the next step once there's more than one locale to pick
   between, and is intentionally not built until it's needed.

## Adding a new string

1. Add the key to `en.json` (and every other locale file that exists at the time).
2. Call `t("your.new.key")` from the component instead of writing the string inline.

## Adding a new component that needs translated strings

Import `t` directly (`import { t } from "../../i18n/index.js"`, adjusting the relative
path) for a plain function component, exactly as `Dock.tsx`, `Card.tsx`,
`PageStack.tsx`, `VaultView.tsx`, and `App.tsx` already do. `useTranslation()` is there
if a component would rather destructure `{ t }` from a hook — functionally identical
today, since there's no locale-switching state to subscribe to yet.
