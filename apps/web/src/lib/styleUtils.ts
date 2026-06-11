import type { PtTopLevel, PtBlock, PtSection, PtTable, PtTableCell } from "./api";
import type { StyleKey } from "./api";

const STYLE_ORDER: StyleKey[] = [
  "normal",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "tableHeader", "tableData",
];

export function deriveVisibleStyles(blocks: PtTopLevel[]): StyleKey[] {
  const found = new Set<StyleKey>(["normal"]);
  collectStyles(blocks, found);
  return STYLE_ORDER.filter(k => found.has(k));
}

function collectStyles(
  nodes: Array<PtTopLevel | PtBlock | PtTable>,
  found: Set<StyleKey>,
): void {
  for (const node of nodes) {
    if (node._type === "block") {
      const b = node as PtBlock;
      if (/^h[1-6]$/.test(b.style)) found.add(b.style as StyleKey);
    } else if (node._type === "section") {
      const s = node as PtSection;
      collectStyles(s.content, found);
    } else if (node._type === "table") {
      const t = node as PtTable;
      found.add("tableData");
      for (const row of t.rows) {
        for (const cell of row.cells as PtTableCell[]) {
          if (cell.isHeader) found.add("tableHeader");
          collectStyles(cell.content, found);
        }
      }
    }
  }
}
