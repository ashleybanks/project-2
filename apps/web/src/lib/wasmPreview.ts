import type { PtTopLevel, StylesheetDef } from "./api";
import { FONTS } from "./fonts";

type WasmModule = typeof import("typst-compiler");

let modulePromise: Promise<WasmModule> | null = null;

function getModule(): Promise<WasmModule> {
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
  const resp = await fetch(`/api/fonts/css?family=${encodeURIComponent(familyParam)}`);
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
  console.log(`[typst-preview] ${family}: loaded ${data.length} font file(s) as TTF`);
  fontBytesCache.set(family, data);
  return data;
}

export async function renderPreview(
  blocks: PtTopLevel[],
  stylesheet: StylesheetDef,
): Promise<Uint8Array> {
  const wasm = await getModule();

  const families = new Set<string>();
  if (stylesheet.bodyFont) families.add(stylesheet.bodyFont);
  if (stylesheet.headingFont) families.add(stylesheet.headingFont);

  const allFontData: ArrayBuffer[] = [];
  for (const family of families) {
    const data = await fetchFontFamily(family);
    allFontData.push(...data);
  }

  const fontArrays = allFontData.map((b) => new Uint8Array(b));
  return wasm.render_preview(JSON.stringify(blocks), JSON.stringify(stylesheet), fontArrays);
}
