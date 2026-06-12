import type { PtTopLevel, StylesheetDef } from "./api";

type WasmModule = typeof import("typst-compiler");

let modulePromise: Promise<WasmModule> | null = null;

function getModule(): Promise<WasmModule> {
  if (!modulePromise) {
    modulePromise = import("typst-compiler");
  }
  return modulePromise;
}

export async function renderPreview(
  blocks: PtTopLevel[],
  _stylesheet: StylesheetDef,
): Promise<Uint8Array> {
  const wasm = await getModule();
  const blocksJson = JSON.stringify(blocks);
  const stylesheetJson = JSON.stringify(_stylesheet);
  return wasm.render_preview(blocksJson, stylesheetJson);
}
