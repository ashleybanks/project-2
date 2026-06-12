import type {
  PtBlock,
  PtSection,
  PtTopLevel,
  PtChild,
  PtSpan,
  PtFieldIntent,
  PtTable,
  PtTableRow,
  PtTableCell,
} from "./api";

// ── PT → ProseMirror ──────────────────────────────────────────────────────────

export function ptToProsemirror(blocks: PtTopLevel[]): object {
  return {
    type: "doc",
    content: ptTopLevelsToPmNodes(blocks),
  };
}

function ptTopLevelsToPmNodes(entries: PtTopLevel[]): PmNode[] {
  const result: PmNode[] = [];
  const pending: PtBlock[] = [];

  const flush = () => {
    if (pending.length > 0) {
      result.push(...ptBlocksToPmNodes([...pending]));
      pending.length = 0;
    }
  };

  for (const entry of entries) {
    if (entry._type === "section") {
      flush();
      const s = entry as PtSection;
      result.push({
        type: "section",
        attrs: {
          conditionIntent: s.conditionIntent ?? null,
          repeatIntent: s.repeatIntent ?? null,
          key: s._key,
        },
        content: ptBlocksToPmNodes(s.content),
      });
    } else if (entry._type === "table") {
      flush();
      result.push(ptTableToPm(entry as PtTable));
    } else {
      pending.push(entry as PtBlock);
    }
  }
  flush();
  return result;
}

// Converts a flat array of PtBlocks/PtTables to PM nodes, grouping consecutive
// list items into bulletList / orderedList nodes.
function ptBlocksToPmNodes(blocks: Array<PtBlock | PtTable>): PmNode[] {
  const result: PmNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b._type === "table") {
      result.push(ptTableToPm(b as PtTable));
      i++;
      continue;
    }
    const block = b as PtBlock;
    if (block.listItem) {
      const { node, end } = buildListGroup(blocks as PtBlock[], i);
      result.push(node);
      i = end;
    } else {
      const pm = ptBlockToPm(block);
      if (pm) result.push(pm);
      i++;
    }
  }
  return result;
}

function ptTableToPm(table: PtTable): PmNode {
  return {
    type: "table",
    content: table.rows.map((row: PtTableRow) => ({
      type: "tableRow",
      content: row.cells.map((cell: PtTableCell) => ({
        type: cell.isHeader ? "tableHeader" : "tableCell",
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: ptBlocksToPmNodes(cell.content),
      })),
    })),
  };
}

// Build a single bulletList/orderedList node starting at `start`.
function buildListGroup(
  blocks: PtBlock[],
  start: number,
): { node: PmNode; end: number } {
  const listType =
    blocks[start].listItem === "bullet" ? "bulletList" : "orderedList";
  const { items, end } = buildListLevel(
    blocks,
    start,
    1,
    blocks[start].listItem!,
  );
  return { node: { type: listType, content: items }, end };
}

// Recursively build listItem nodes for a given nesting level.
function buildListLevel(
  blocks: PtBlock[],
  start: number,
  targetLevel: number,
  groupType: string,
): { items: PmNode[]; end: number } {
  const items: PmNode[] = [];
  let i = start;

  while (i < blocks.length) {
    const b = blocks[i];
    if (!b.listItem) break;
    const level = b.level ?? 1;
    if (level < targetLevel) break;
    if (level === targetLevel && b.listItem !== groupType) break;
    if (level > targetLevel) {
      i++;
      continue;
    } // skip orphaned deeper items

    const para: PmNode = {
      type: "paragraph",
      content: (b.children ?? []).map(ptChildToPm).filter(Boolean) as PmNode[],
    };
    const itemContent: PmNode[] = [para];
    i++;

    // Consume any immediately following deeper-level items as a nested list.
    while (
      i < blocks.length &&
      blocks[i].listItem &&
      (blocks[i].level ?? 1) > targetLevel
    ) {
      const nestedType =
        blocks[i].listItem === "bullet" ? "bulletList" : "orderedList";
      const { items: nestedItems, end } = buildListLevel(
        blocks,
        i,
        targetLevel + 1,
        blocks[i].listItem!,
      );
      itemContent.push({ type: nestedType, content: nestedItems });
      i = end;
    }

    items.push({ type: "listItem", content: itemContent });
  }
  return { items, end: i };
}

function ptBlockToPm(block: PtBlock): PmNode | null {
  const isHeading = /^h[1-6]$/.test(block.style);
  const attrs: Record<string, unknown> = {};
  if (block.textAlign) attrs.textAlign = block.textAlign;

  if (isHeading) {
    attrs.level = parseInt(block.style.slice(1));
    return {
      type: "heading",
      attrs,
      content: (block.children ?? [])
        .map(ptChildToPm)
        .filter(Boolean) as PmNode[],
    };
  }
  return {
    type: "paragraph",
    ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
    content: (block.children ?? [])
      .map(ptChildToPm)
      .filter(Boolean) as PmNode[],
  };
}

function ptChildToPm(child: PtChild): PmNode | null {
  if (child._type === "fieldIntent") {
    return {
      type: "fieldIntent",
      attrs: {
        label: child.label,
        key: child._key,
        display_name: child.display_name ?? null,
        field_path: child.field_path ?? null,
      },
    };
  }
  if (child._type === "span") {
    const span = child as PtSpan;
    if (!span.text) return null;
    const marks = span.marks.map(markToPm).filter(Boolean) as PmNode[];
    return {
      type: "text",
      text: span.text,
      ...(marks.length > 0 ? { marks } : {}),
    };
  }
  return null;
}

function markToPm(mark: string): object | null {
  switch (mark) {
    case "strong":
      return { type: "bold" };
    case "em":
      return { type: "italic" };
    case "underline":
      return { type: "underline" };
    case "strike":
      return { type: "strike" };
    case "sub":
      return { type: "subscript" };
    case "sup":
      return { type: "superscript" };
    default:
      return null;
  }
}

// ── ProseMirror → PT ──────────────────────────────────────────────────────────

let keyCounter = 1;
function newKey() {
  return `k${keyCounter++}`;
}

interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
  marks?: Array<{ type: string }>;
}

export function prosemirrorToPt(doc: { content?: PmNode[] }): PtTopLevel[] {
  const result: PtTopLevel[] = [];
  for (const node of doc.content ?? []) {
    if (node.type === "section") {
      result.push({
        _type: "section",
        _key: (node.attrs?.key as string) ?? newKey(),
        conditionIntent: (node.attrs?.conditionIntent as string) ?? undefined,
        repeatIntent: (node.attrs?.repeatIntent as string) ?? undefined,
        content: extractPtBlocks(node.content ?? []),
      } satisfies PtSection);
    } else if (node.type === "table") {
      result.push(pmTableToPt(node));
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      result.push(
        ...extractListBlocks(
          node,
          node.type === "bulletList" ? "bullet" : "number",
          1,
        ),
      );
    } else {
      const b = pmNodeToPtBlock(node);
      if (b) result.push(b);
    }
  }
  return result;
}

function extractPtBlocks(nodes: PmNode[]): Array<PtBlock | PtTable> {
  const blocks: Array<PtBlock | PtTable> = [];
  for (const n of nodes) {
    if (n.type === "section") {
      blocks.push(...extractPtBlocks(n.content ?? []));
    } else if (n.type === "table") {
      blocks.push(pmTableToPt(n));
    } else if (n.type === "bulletList" || n.type === "orderedList") {
      blocks.push(
        ...extractListBlocks(
          n,
          n.type === "bulletList" ? "bullet" : "number",
          1,
        ),
      );
    } else {
      const b = pmNodeToPtBlock(n);
      if (b) blocks.push(b);
    }
  }
  return blocks;
}

function pmTableToPt(node: PmNode): PtTable {
  return {
    _type: "table",
    _key: newKey(),
    rows: (node.content ?? []).map((row) => ({
      _type: "tableRow" as const,
      _key: newKey(),
      cells: (row.content ?? []).map((cell) => ({
        _type: "tableCell" as const,
        _key: newKey(),
        isHeader: cell.type === "tableHeader",
        content: extractPtBlocks(cell.content ?? []).filter(
          (b): b is PtBlock => b._type === "block",
        ),
      })),
    })),
  };
}

function extractListBlocks(
  node: PmNode,
  listType: "bullet" | "number",
  level: number,
): PtBlock[] {
  const blocks: PtBlock[] = [];
  for (const item of node.content ?? []) {
    if (item.type !== "listItem") continue;
    for (const child of item.content ?? []) {
      if (child.type === "paragraph") {
        const textAlign =
          (child.attrs?.textAlign as string | undefined) ?? undefined;
        blocks.push({
          _type: "block",
          _key: newKey(),
          style: "normal",
          listItem: listType,
          level,
          ...(textAlign && textAlign !== "left"
            ? { textAlign: textAlign as PtBlock["textAlign"] }
            : {}),
          children: (child.content ?? [])
            .map(pmNodeToPtChild)
            .filter(Boolean) as PtChild[],
        } satisfies PtBlock);
      } else if (child.type === "bulletList" || child.type === "orderedList") {
        blocks.push(
          ...extractListBlocks(
            child,
            child.type === "bulletList" ? "bullet" : "number",
            level + 1,
          ),
        );
      }
    }
  }
  return blocks;
}

function pmNodeToPtBlock(node: PmNode): PtBlock | null {
  if (node.type !== "paragraph" && node.type !== "heading") return null;
  const level =
    node.type === "heading" ? ((node.attrs?.level as number) ?? 1) : null;
  const style: string = level ? `h${level}` : "normal";
  const textAlign = (node.attrs?.textAlign as string | undefined) ?? undefined;
  return {
    _type: "block",
    _key: newKey(),
    style,
    ...(textAlign && textAlign !== "left"
      ? { textAlign: textAlign as PtBlock["textAlign"] }
      : {}),
    children: (node.content ?? [])
      .map(pmNodeToPtChild)
      .filter(Boolean) as PtChild[],
  } satisfies PtBlock;
}

function pmNodeToPtChild(node: PmNode): PtChild | null {
  if (node.type === "fieldIntent") {
    return {
      _type: "fieldIntent",
      _key: (node.attrs?.key as string) ?? newKey(),
      label: (node.attrs?.label as string) ?? "",
      display_name: (node.attrs?.display_name as string | null) ?? undefined,
      field_path: (node.attrs?.field_path as string | null) ?? undefined,
    } satisfies PtFieldIntent;
  }
  if (node.type === "text" && node.text) {
    const marks = (node.marks ?? [])
      .map((m) => pmMarkToPt(m.type))
      .filter(Boolean) as string[];
    return {
      _type: "span",
      _key: newKey(),
      text: node.text,
      marks,
    } satisfies PtSpan;
  }
  return null;
}

function pmMarkToPt(type: string): string | null {
  switch (type) {
    case "bold":
      return "strong";
    case "italic":
      return "em";
    case "underline":
      return "underline";
    case "strike":
      return "strike";
    case "subscript":
      return "sub";
    case "superscript":
      return "sup";
    default:
      return null;
  }
}
