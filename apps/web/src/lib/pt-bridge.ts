import type { PtBlock, PtChild, PtSpan, PtFieldIntent } from "./api";

// ── PT → ProseMirror ──────────────────────────────────────────────────────────

export function ptToProsemirror(blocks: PtBlock[]): object {
  return {
    type: "doc",
    content: blocks.map(ptBlockToPm),
  };
}

function ptBlockToPm(block: PtBlock): object {
  const isHeading = ["h1", "h2", "h3"].includes(block.style);
  if (isHeading) {
    const level = parseInt(block.style.slice(1));
    return {
      type: "heading",
      attrs: { level },
      content: block.children.map(ptChildToPm).filter(Boolean),
    };
  }
  return {
    type: "paragraph",
    content: block.children.map(ptChildToPm).filter(Boolean),
  };
}

function ptChildToPm(child: PtChild): object | null {
  if (child._type === "fieldIntent") {
    return {
      type: "fieldIntent",
      attrs: { label: child.label, key: child._key },
    };
  }
  if (child._type === "span") {
    const span = child as PtSpan;
    if (!span.text) return null;
    const marks = span.marks.map((m) => markToPm(m)).filter(Boolean);
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
    case "strong":    return { type: "bold" };
    case "em":        return { type: "italic" };
    case "underline": return { type: "underline" };
    case "strike":    return { type: "strike" };
    default:          return null;
  }
}

// ── ProseMirror → PT ──────────────────────────────────────────────────────────

let keyCounter = 1;
function newKey() { return `k${keyCounter++}`; }

export function prosemirrorToPt(doc: { content?: PmNode[] }): PtBlock[] {
  return (doc.content ?? []).map(pmNodeToPtBlock).filter(Boolean) as PtBlock[];
}

interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
  marks?: Array<{ type: string }>;
}

function pmNodeToPtBlock(node: PmNode): PtBlock | null {
  if (node.type === "paragraph" || node.type === "heading") {
    const level = node.type === "heading" ? (node.attrs?.level as number ?? 1) : null;
    const style = level ? `h${level}` : "normal";
    return {
      _type: "block",
      _key: newKey(),
      style,
      children: (node.content ?? []).map(pmNodeToPtChild).filter(Boolean) as PtChild[],
    };
  }
  return null;
}

function pmNodeToPtChild(node: PmNode): PtChild | null {
  if (node.type === "fieldIntent") {
    return {
      _type: "fieldIntent",
      _key: (node.attrs?.key as string) ?? newKey(),
      label: (node.attrs?.label as string) ?? "",
    } satisfies PtFieldIntent;
  }
  if (node.type === "text" && node.text) {
    const marks = (node.marks ?? []).map((m) => pmMarkToPt(m.type)).filter(Boolean) as string[];
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
    case "bold":      return "strong";
    case "italic":    return "em";
    case "underline": return "underline";
    case "strike":    return "strike";
    default:          return null;
  }
}
