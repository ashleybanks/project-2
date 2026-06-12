# Tessia

## Design system

Before implementing any UI, read `apps/web/DESIGN.md`. It is the source of truth for:
- Brand principles and target user
- Color tokens — always use semantic tokens (`text-muted-foreground`, `bg-card`, etc.), never raw zinc/gray classes
- Typography scale and weights
- Spacing and grid
- Component patterns (buttons, forms, cards, empty states, loading states)

**Primary color is indigo** — `--primary: oklch(0.499 0.190 265)`. Do not use orange.

## Tech stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4 (via Vite plugin, no config file — theme lives in `apps/web/src/index.css`), shadcn/ui (base-nova style), Lucide icons
- **Editor:** Tiptap (ProseMirror). Table extensions use named exports, not defaults. List markers require the typography plugin.
- **Backend:** Rust/Axum API at localhost:3000
- **Fonts:** Figtree only — do not introduce a second typeface

## Known gotchas

- Tailwind config is inline `@theme` in `src/index.css`, not a `tailwind.config.ts` file
- Tiptap table imports: use named exports (`import { Table } from '@tiptap/extension-table'`), not default imports
- List markers need the typography extension — if lists aren't rendering markers, check it's loaded
- Stylesheet defaults must be stored explicitly, not computed at read-time
