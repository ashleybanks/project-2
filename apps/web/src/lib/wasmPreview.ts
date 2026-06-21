import type {
  PtBlock,
  PtFieldIntent,
  PtTable,
  PtTopLevel,
  StylesheetDef,
} from "./api";
import { FONTS } from "./fonts";

type WasmModule = typeof import("typst-compiler");

let modulePromise: Promise<WasmModule> | null = null;

async function getModule(): Promise<WasmModule> {
  if (!modulePromise) {
    modulePromise = import("typst-compiler");
  }
  return modulePromise;
}

// Cache by family → list of fetched TTF ArrayBuffers
const fontBytesCache = new Map<string, ArrayBuffer[]>();
// Cache by URL → TTF bytes
const urlBytesCache = new Map<string, ArrayBuffer>();

function isKnownFont(family: string): boolean {
  return FONTS.some((f) => f.value === family);
}

/**
 * Fetch the Google Fonts CSS via our server-side proxy.
 * The proxy endpoint makes the request without a browser User-Agent, so
 * Google returns TTF URLs instead of woff2 — TTF is what Typst's font
 * loader actually accepts.
 */
async function fetchFontTtfUrls(family: string): Promise<string[]> {
  // Request regular, bold, and italic variants
  const familyParam = `${family}:ital,wght@0,400;0,700;1,400`;
  const resp = await fetch(
    `/api/fonts/css?family=${encodeURIComponent(familyParam)}`,
  );
  if (!resp.ok) return [];
  const css = await resp.text();
  // Extract all TTF/OTF URLs from src: url(...) declarations
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)]
    .map((m) => m[1].replace(/['"]/g, ""))
    .filter((u) => u.startsWith("https://"));
  return [...new Set(urls)];
}

async function fetchFontFamily(family: string): Promise<ArrayBuffer[]> {
  if (!isKnownFont(family)) return [];
  if (fontBytesCache.has(family)) return fontBytesCache.get(family)!;

  let urls: string[];
  try {
    urls = await fetchFontTtfUrls(family);
  } catch (err) {
    console.warn("[typst-preview] Failed to fetch font CSS for", family, err);
    fontBytesCache.set(family, []);
    return [];
  }

  const results = await Promise.all(
    urls.map(async (url) => {
      if (urlBytesCache.has(url)) return urlBytesCache.get(url)!;
      try {
        const r = await fetch(url);
        if (!r.ok) return null;
        const data = await r.arrayBuffer();
        urlBytesCache.set(url, data);
        return data;
      } catch {
        return null;
      }
    }),
  );

  const data = results.filter((b): b is ArrayBuffer => b !== null);
  console.log(
    `[typst-preview] ${family}: loaded ${data.length} font file(s) as TTF`,
  );
  fontBytesCache.set(family, data);
  return data;
}

async function resolveFonts(stylesheet: StylesheetDef): Promise<Uint8Array[]> {
  const families = new Set<string>();
  if (stylesheet.bodyFont) families.add(stylesheet.bodyFont);
  if (stylesheet.headingFont) families.add(stylesheet.headingFont);

  const allFontData: ArrayBuffer[] = [];
  for (const family of families) {
    const data = await fetchFontFamily(family);
    allFontData.push(...data);
  }
  return allFontData.map((b) => new Uint8Array(b));
}

export async function renderPreview(
  blocks: PtTopLevel[],
  stylesheet: StylesheetDef,
): Promise<Uint8Array> {
  const wasm = await getModule();
  const fontArrays = await resolveFonts(stylesheet);
  return wasm.render_preview(
    JSON.stringify(blocks),
    JSON.stringify(stylesheet),
    fontArrays,
  );
}

export async function renderPreviewWithData(
  blocks: PtTopLevel[],
  stylesheet: StylesheetDef,
  payload: object,
): Promise<Uint8Array> {
  const wasm = await getModule();
  const fontArrays = await resolveFonts(stylesheet);
  return wasm.render_preview_with_data(
    JSON.stringify(blocks),
    JSON.stringify(stylesheet),
    JSON.stringify(payload),
    fontArrays,
  );
}

export async function renderPreviewSvg(
  blocks: PtTopLevel[],
  stylesheet: StylesheetDef,
): Promise<string[]> {
  const wasm = await getModule();
  const fontArrays = await resolveFonts(stylesheet);
  return wasm.render_preview_svg(
    JSON.stringify(blocks),
    JSON.stringify(stylesheet),
    fontArrays,
  ) as string[];
}

export async function renderPreviewWithDataSvg(
  blocks: PtTopLevel[],
  stylesheet: StylesheetDef,
  payload: object,
): Promise<string[]> {
  const wasm = await getModule();
  const fontArrays = await resolveFonts(stylesheet);
  return wasm.render_preview_with_data_svg(
    JSON.stringify(blocks),
    JSON.stringify(stylesheet),
    JSON.stringify(payload),
    fontArrays,
  ) as string[];
}

// ── Field intent chip overlay positions ────────────────────────────────────────

export interface FieldIntentPosition {
  key: string;
  page: number;
  x_pt: number;
  y_pt: number;
  w_pt: number;
  h_pt: number;
}

interface PreviewWithPositions {
  pages: string[];
  positions: FieldIntentPosition[];
}

/**
 * Same as `renderPreviewWithDataSvg`, but also returns the on-page position of
 * every field-intent chip, keyed `fi-0`, `fi-1`, ... in the same depth-first
 * order as `collectFieldIntents` below — that order must match the Rust
 * compiler's `map_to_block_model` walk so chip N here is field intent N there.
 */
export async function renderPreviewWithDataSvgPositions(
  blocks: PtTopLevel[],
  stylesheet: StylesheetDef,
  payload: object,
): Promise<PreviewWithPositions> {
  const wasm = await getModule();
  const fontArrays = await resolveFonts(stylesheet);
  const json = wasm.render_preview_with_data_svg_positions(
    JSON.stringify(blocks),
    JSON.stringify(stylesheet),
    JSON.stringify(payload),
    fontArrays,
  ) as string;
  return JSON.parse(json) as PreviewWithPositions;
}

/**
 * Walk `blocks` depth-first and return every field intent that resolved to a
 * MergeField (i.e. has a `field_path` or an `expression`), in the same order
 * the Rust compiler assigns `fi-N` labels in `map_to_block_model`. The Nth
 * entry here corresponds to label `fi-N`.
 */
export function collectFieldIntents(blocks: PtTopLevel[]): PtFieldIntent[] {
  const out: PtFieldIntent[] = [];

  function walkBlock(b: PtBlock) {
    for (const child of b.children) {
      if (
        child._type === "fieldIntent" &&
        (child.field_path || child.expression)
      ) {
        out.push(child);
      }
    }
  }

  function walkTable(t: PtTable) {
    for (const row of t.rows) {
      for (const cell of row.cells) {
        for (const b of cell.content) walkBlock(b);
      }
    }
  }

  function walkTopLevel(entries: PtTopLevel[]) {
    for (const entry of entries) {
      if (entry._type === "block") walkBlock(entry);
      else if (entry._type === "section") {
        for (const e of entry.content) {
          if (e._type === "block") walkBlock(e);
          else walkTable(e);
        }
      } else if (entry._type === "table") walkTable(entry);
    }
  }

  walkTopLevel(blocks);
  return out;
}

/**
 * Look up a dot-separated path (e.g. `"invoice.due_date"`) in a JSON payload.
 * Used to show the raw, unformatted value behind an expression-bearing field
 * in the Preview tab's Data mode.
 */
export function getByPath(
  payload: Record<string, unknown>,
  path: string,
): unknown {
  let current: unknown = payload;
  for (const segment of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Parse `width`/`height` (in pt) from an SVG string's `viewBox` attribute. */
export function parseSvgPageSize(
  svg: string,
): { widthPt: number; heightPt: number } | null {
  const match = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!match) return null;
  return { widthPt: parseFloat(match[1]), heightPt: parseFloat(match[2]) };
}
