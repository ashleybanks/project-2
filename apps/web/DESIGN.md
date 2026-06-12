# Tessia Design System

## Brand

### Positioning

Tessia is the approachable, intelligent alternative to overwhelming legal document tools. Where DocuSign and PandaDoc feel like enterprise software — dense, procedural, built for compliance teams — Tessia feels like a tool a smart person would actually enjoy using.

The analogy is Figma vs Photoshop: Figma didn't beat Photoshop by having more features. It won by making the complexity invisible. Tessia does the same for legal document generation: AI handles the hard parts, and the interface gets out of the way.

**Primary user:** Lawyers and legal professionals who need to produce and personalise contracts and agreements at volume. They are sophisticated and precise — they don't want to be condescended to — but they are not tool enthusiasts. The UI should feel like it was made by someone who respects their time.

### Principles

1. **Clarity over cleverness.** Every element earns its place. If removing it doesn't break anything, remove it.
2. **Breathing room signals confidence.** Generous whitespace is not waste — it's how the interface communicates that it's in control.
3. **Progressive disclosure.** Show what's needed now. Hide complexity until it's asked for.
4. **Precision without coldness.** Legal context requires exactness, but that doesn't mean the interface should feel sterile. Warmth comes from typography, spacing, and restraint — not decoration.

---

## Color

### Primary — Indigo

The brand primary is **indigo**. It reads as intelligent and trustworthy without the cold formality of DocuSign navy, and without the corporate genericness of blue. It's associated with the generation of professional tools (Linear, Superhuman) that feel considered rather than enterprise-issued.

```css
--primary:            oklch(0.499 0.190 265);   /* indigo ~#5046c8 */
--primary-foreground: oklch(1 0 0);
--ring:               oklch(0.499 0.190 265);
```

### Semantic tokens (all surfaces)

Use these in all components. Never reach for raw Tailwind color classes like `zinc-100` or `gray-500` — they break if the theme changes.

| Token | CSS variable | Light value | Use for |
|-------|-------------|-------------|---------|
| `bg-background` | `--background` | zinc-50 `#fafafa` | Page background |
| `bg-card` | `--card` | white | Card, panel, popover surfaces |
| `text-foreground` | `--foreground` | zinc-900 | Primary text |
| `text-muted-foreground` | `--muted-foreground` | zinc-500 | Secondary text, labels, placeholders |
| `bg-muted` | `--muted` | zinc-100 | Subtle backgrounds, hover states |
| `bg-secondary` | `--secondary` | zinc-100 | Secondary button fill |
| `border-border` | `--border` | zinc-200 | All borders and dividers |
| `border-input` | `--input` | zinc-200 | Form input borders |
| `bg-primary` | `--primary` | indigo | Primary actions, active states |
| `text-primary` | `--primary` | indigo | Links, active tab indicators |
| `ring-ring` | `--ring` | indigo | Focus rings |
| `text-destructive` | `--destructive` | red | Errors, danger actions |

### What not to do

- Do not use `text-zinc-500`, `bg-zinc-100`, `border-zinc-200` etc. Use the semantic tokens above.
- Do not add new named colors. If a new semantic need arises (e.g. `success`), define it in `index.css` as a CSS variable first.
- Do not use opacity hacks for new tones (e.g. `primary/20`) without first checking the semantic token set covers the use case.

---

## Typography

### Typeface

**Figtree** — a geometric, variable sans-serif. Used for all text: headings, body, UI labels. Do not introduce a second typeface.

- Import: Google Fonts, `ital,wght@0,300..900;1,300..900`
- Fallback: `ui-sans-serif, system-ui, sans-serif`
- Rendering: `antialiased` (`-webkit-font-smoothing: antialiased`)

### Scale

All sizes sit on an 8px grid. Line-heights are intentionally generous to support the "breathing room" principle.

| Class | Size | Line-height | Use for |
|-------|------|-------------|---------|
| `text-xs` | 12px | 16px | Timestamps, captions, meta only |
| `text-sm` | 14px | 20px | Secondary labels, helper text |
| `text-base` | 16px | 24px | Body default |
| `text-lg` | 18px | 28px | Slightly emphasised body |
| `text-xl` | 20px | 32px | Section headings (small) |
| `text-2xl` | 24px | 32px | Page section headings |
| `text-3xl` | 30px | 40px | Page titles |
| `text-4xl` | 36px | 48px | Hero/marketing headings |
| `text-5xl` | 48px | 56px | Reserved for large display |

### Weights

| Weight | Class | Use for |
|--------|-------|---------|
| 400 | `font-normal` | Body text, labels |
| 500 | `font-medium` | Slightly emphasised UI labels, button text |
| 600 | `font-semibold` | Headings, section titles |
| 700+ | Avoid | Too heavy for this UI character |

### Rules

- Heading elements (`h1`–`h6`) default to `font-semibold`, `line-height: 1.25`, `margin: 0`
- Body default: `text-base`, `leading-6`, `font-normal`
- Never set font sizes in `px` directly — use the scale classes
- Avoid italics in UI chrome; reserve for document content display

---

## Spacing & Grid

Base unit: **8px**. All spacing decisions should be multiples of 4px (half-unit) at minimum, multiples of 8px preferred.

### Common spacing values

| Class | Value | Use for |
|-------|-------|---------|
| `gap-1` / `p-1` | 4px | Tight icon spacing, within-badge padding |
| `gap-1.5` / `p-1.5` | 6px | Small button vertical padding |
| `gap-2` / `p-2` | 8px | Default spacing within components |
| `gap-3` / `p-3` | 12px | Compact section padding |
| `gap-4` / `p-4` | 16px | Standard section padding, card content |
| `gap-6` / `p-6` | 24px | Generous section padding |
| `gap-8` / `p-8` | 32px | Page-level horizontal padding |
| `py-10` | 40px | Page-level vertical padding |

### Page container

```tsx
// Standard centred page layout
<div className="max-w-4xl mx-auto px-8 py-10">
```

### Sidebar / panel widths

| Element | Width class | Value |
|---------|------------|-------|
| Right panel (expanded) | `w-72` | 288px |
| Right panel (collapsed) | `w-10` | 40px |
| Dropdown menus | `w-52` | 208px |

---

## Border Radius

One radius variable scales everything. The base is `--radius: 0.5rem` (8px).

| Token | Tailwind class | Value | Use for |
|-------|---------------|-------|---------|
| `--radius-sm` | `rounded-sm` | 2px | Badges, small chips |
| `--radius-md` | `rounded-md` | 4px | Inputs, buttons |
| `--radius-lg` | `rounded-lg` | 6px | Cards, panels (default surface) |
| `--radius-xl` | `rounded-xl` | 8px | Modals, command palette |

Default to `rounded-lg` for most surfaces. Use `rounded-xl` only for elevated/floating surfaces (modals, command palette).

---

## Elevation & Shadows

Tessia uses minimal shadow. Elevation is communicated primarily through **border** and **background colour contrast**, not drop shadows.

| Situation | Approach |
|-----------|----------|
| Card on page background | `bg-card border border-border rounded-lg` |
| Popover / dropdown | `bg-card border border-border rounded-lg shadow-md` |
| Modal / dialog | `bg-card border border-border rounded-xl shadow-lg` |
| Hover lift effect | Avoid — prefer background colour change instead |

---

## Motion

`tw-animate-css` is imported. Use sparingly. Motion should aid comprehension (reveal, collapse, transition between states), not decorate.

| Use case | Approach |
|----------|----------|
| Panel open/close | Slide + fade, `duration-200` |
| Dropdown appear | Fade + scale from origin, `duration-150` |
| Page transition | Fade only, `duration-200` |
| Loading states | Pulse/skeleton only — no spinners unless async wait >1s |

Default easing: `ease-out` for entrances, `ease-in` for exits.

---

## Components

### Buttons

Built with CVA via `button.tsx`. Variants:

| Variant | Use for |
|---------|---------|
| `default` | Primary action (filled indigo) |
| `secondary` | Secondary action (filled zinc-100) |
| `outline` | Tertiary action, less emphasis |
| `ghost` | Icon buttons, toolbar actions, minimal emphasis |
| `destructive` | Irreversible or dangerous actions only |
| `link` | Inline text links |

**Rules:**
- One primary (`default`) button per view region. Use `secondary` or `ghost` for everything else.
- Button text: sentence case, verb-first ("Save changes", not "Changes saved")
- Icon buttons: always pair with a tooltip; use `size="icon"` variant
- Loading state: disable the button and show a spinner inside — never disable without visual feedback

### Form inputs

Built on `@base-ui/react/input`. Always pair with a `<label>` (never placeholder-only). Helper text in `text-sm text-muted-foreground` below the input.

```tsx
<div className="flex flex-col gap-1.5">
  <Label htmlFor="field">Field label</Label>
  <Input id="field" placeholder="…" />
  <p className="text-sm text-muted-foreground">Helper text</p>
</div>
```

### Cards

Use `bg-card border border-border rounded-lg` as the base surface. `CardHeader` and `CardContent` handle internal padding. Do not add extra padding wrappers inside card content.

### Tabs

Two variants in `tabs.tsx`:
- `default`: pill-style — use for top-level view switching
- `line`: underline-style — use for secondary tab groups within a panel

### Badges

Use for status labels and counts. Never use more than two badges in proximity — if you need more, use a table or list.

---

## Page & Layout Patterns

### Standard page

```tsx
<AppLayout>
  <div className="max-w-4xl mx-auto px-8 py-10">
    <div className="flex flex-col gap-8">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">Page title</h1>
        <p className="text-sm text-muted-foreground">Supporting description</p>
      </div>
      {/* Page content */}
    </div>
  </div>
</AppLayout>
```

### Section within a page

```tsx
<div className="flex flex-col gap-4">
  <div className="flex flex-col gap-1">
    <h2 className="text-base font-semibold text-foreground">Section title</h2>
    <p className="text-sm text-muted-foreground">Optional description</p>
  </div>
  {/* Section content */}
</div>
```

### Empty states

Every list or table needs an empty state. Keep it minimal: icon (optional), heading, one line of explanation, one action if relevant.

```tsx
<div className="flex flex-col items-center gap-3 py-12 text-center">
  <p className="text-sm font-medium text-foreground">No items yet</p>
  <p className="text-sm text-muted-foreground">Create one to get started.</p>
  <Button size="sm">Create item</Button>
</div>
```

### Loading states

- Short waits (&lt;300ms): nothing — avoid flash of spinner
- Medium waits (300ms–2s): skeleton placeholder matching the shape of the content
- Long waits (&gt;2s): spinner with a brief label ("Generating…")

---

## What to Avoid

| Don't | Do instead |
|-------|-----------|
| Raw zinc/gray color classes (`text-zinc-500`) | Use semantic tokens (`text-muted-foreground`) |
| Multiple primary actions on one screen | One `default` button, rest secondary/ghost |
| Deeply nested shadows and gradients | Flat surfaces with border + background contrast |
| Two different typefaces | Figtree only |
| Italic or uppercase in UI chrome | Reserve for document content or specific emphasis |
| Pixel font sizes | Use the defined type scale |
| Animations that loop or persist | Motion only for state transitions |
| Placeholder-only form fields | Always use a visible label |
| Custom one-off colors | Define a new CSS variable if genuinely needed |

---

## Implementation checklist (for new features)

When Claude or a developer implements a new page or component:

- [ ] Color: all classes use semantic tokens, no raw zinc/gray
- [ ] Typography: sizes and weights from the defined scale only
- [ ] Spacing: all values multiples of 4px, page container uses `max-w-4xl mx-auto px-8 py-10`
- [ ] Buttons: one primary action maximum, verb-first labels
- [ ] Empty state: defined for any list or table
- [ ] Loading state: defined for any async operation
- [ ] Labels: every form input has a visible `<Label>`
