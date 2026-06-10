import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Heading from "@tiptap/extension-heading";
import UnderlineExt from "@tiptap/extension-underline";
import SubscriptExt from "@tiptap/extension-subscript";
import SuperscriptExt from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { FieldIntentNode } from "../editor/FieldIntentNode";
import { SectionNode } from "../editor/SectionNode";
import { sectionNodeViewRenderer } from "../editor/SectionNodeView";
import { ptToProsemirror, prosemirrorToPt } from "../lib/pt-bridge";
import type { PtTopLevel } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bold, Italic, Underline, Strikethrough, Subscript, Superscript,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered,
  Heading1, Heading2, Heading3, Heading4, Heading5, Heading6,
} from "lucide-react";

interface Props {
  blocks: PtTopLevel[];
  onChange: (blocks: PtTopLevel[]) => void;
  editorRef?: React.MutableRefObject<ReturnType<typeof useEditor> | null>;
}

export default function BlockCanvas({ blocks, onChange, editorRef }: Props) {
  const [intentPopover, setIntentPopover] = useState<IntentPopoverState | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
      UnderlineExt,
      SubscriptExt,
      SuperscriptExt,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      FieldIntentNode,
      SectionNode.configure({ nodeViewRenderer: sectionNodeViewRenderer }),
    ],
    content: ptToProsemirror(blocks),
    onUpdate: ({ editor }) => {
      const pmJson = editor.getJSON() as { content?: Parameters<typeof prosemirrorToPt>[0]["content"] };
      const newBlocks = prosemirrorToPt(pmJson);
      onChangeRef.current(newBlocks);
    },
    editorProps: {
      attributes: {
        class: "outline-none min-h-[60vh] prose max-w-none prose-zinc focus:outline-none",
      },
      handleContextMenu: (view, event) => {
        // Suppress browser context menu; we handle it ourselves
        event.preventDefault();
        showContextMenu(event.clientX, event.clientY);
        return true;
      },
    },
  });

  // Keep editorRef in sync for Document Map
  useEffect(() => {
    if (editorRef) editorRef.current = editor;
  }, [editor, editorRef]);

  const showContextMenu = useCallback((x: number, y: number) => {
    setIntentPopover({ x, y, mode: "contextmenu" });
  }, []);

  function applyIntent(type: "field" | "condition" | "repeat", label: string) {
    if (!editor) return;
    if (type === "field") {
      editor.chain().focus().setFieldIntent(label).run();
    } else if (type === "condition") {
      if (isInsideSection(editor)) {
        editor.chain().focus().setConditionIntent(label).run();
      } else {
        editor.chain().focus().wrapInSection({ conditionIntent: label }).run();
      }
    } else {
      if (isInsideSection(editor)) {
        editor.chain().focus().setRepeatIntent(label).run();
      } else {
        editor.chain().focus().wrapInSection({ repeatIntent: label }).run();
      }
    }
    setIntentPopover(null);
  }

  function openIntentPopover() {
    if (!editor) return;
    const { view } = editor;
    const { from } = editor.state.selection;
    const coords = view.coordsAtPos(from);
    setIntentPopover({ x: coords.left, y: coords.bottom + 8, mode: "toolbar" });
  }

  const { isInline, isMultiParagraph } = getSelectionKind(editor);

  return (
    <div className="relative">
      {/* Formatting toolbar */}
      <FormattingToolbar editor={editor} onIntentClick={openIntentPopover} />

      {/* Editor surface */}
      <div
        className="mt-3 rounded-lg border border-border bg-white px-8 py-6"
        onContextMenu={(e) => { e.preventDefault(); showContextMenu(e.clientX, e.clientY); }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Bubble menu for intent (selection-based) */}
      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100, placement: "top-start" }}
          shouldShow={({ editor: e }) => {
            const { from, to } = e.state.selection;
            return from !== to;
          }}
        >
          <button
            className="flex items-center gap-1 px-2 py-1 rounded bg-white border border-border shadow-sm text-xs hover:bg-zinc-50 font-medium"
            onMouseDown={(e) => { e.preventDefault(); openIntentPopover(); }}
          >
            ◈ Intent
          </button>
        </BubbleMenu>
      )}

      {/* Intent popover */}
      {intentPopover && editor && (
        <IntentPopover
          x={intentPopover.x}
          y={intentPopover.y}
          isInline={isInline}
          isMultiParagraph={isMultiParagraph}
          onApply={applyIntent}
          onClose={() => setIntentPopover(null)}
        />
      )}
    </div>
  );
}

// ── Intent popover state ──────────────────────────────────────────────────────

interface IntentPopoverState {
  x: number;
  y: number;
  mode: "toolbar" | "contextmenu";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isInsideSection(editor: ReturnType<typeof useEditor>): boolean {
  if (!editor) return false;
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type.name === "section") return true;
  }
  return false;
}

function getSelectionKind(editor: ReturnType<typeof useEditor> | null) {
  if (!editor) return { isInline: true, isMultiParagraph: false };
  const { from, to } = editor.state.selection;
  if (from === to) return { isInline: true, isMultiParagraph: false };

  let blockCount = 0;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (node.isBlock && !node.isLeaf) blockCount++;
  });
  return {
    isInline: blockCount <= 1,
    isMultiParagraph: blockCount > 1,
  };
}

// ── FormattingToolbar ─────────────────────────────────────────────────────────

const SEP = <div className="w-px h-4 bg-border mx-0.5 shrink-0" />;

function FormattingToolbar({
  editor,
  onIntentClick,
}: {
  editor: ReturnType<typeof useEditor> | null;
  onIntentClick: () => void;
}) {
  if (!editor) return null;

  const btn = (
    active: boolean,
    onClick: () => void,
    title: string,
    Icon: React.ComponentType<{ size?: number }>,
  ) => (
    <button
      key={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-zinc-100 text-zinc-600"
      }`}
      title={title}
    >
      <Icon size={14} />
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-1 py-1 rounded-md border border-border bg-white shadow-sm flex-wrap">
      {/* Headings */}
      {([1, 2, 3, 4, 5, 6] as const).map((level) => {
        const Icon = [Heading1, Heading2, Heading3, Heading4, Heading5, Heading6][level - 1];
        return btn(
          editor.isActive("heading", { level }),
          () => editor.chain().focus().toggleHeading({ level }).run(),
          `Heading ${level}`,
          Icon,
        );
      })}

      {SEP}

      {/* Alignment */}
      {btn(editor.isActive({ textAlign: "left" }),    () => editor.chain().focus().setTextAlign("left").run(),    "Align left",    AlignLeft)}
      {btn(editor.isActive({ textAlign: "center" }),  () => editor.chain().focus().setTextAlign("center").run(),  "Align center",  AlignCenter)}
      {btn(editor.isActive({ textAlign: "right" }),   () => editor.chain().focus().setTextAlign("right").run(),   "Align right",   AlignRight)}
      {btn(editor.isActive({ textAlign: "justify" }), () => editor.chain().focus().setTextAlign("justify").run(), "Justify",       AlignJustify)}

      {SEP}

      {/* Lists */}
      {btn(editor.isActive("bulletList"),  () => editor.chain().focus().toggleBulletList().run(),  "Bullet list",   List)}
      {btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "Ordered list",  ListOrdered)}

      {SEP}

      {/* Inline styles */}
      {btn(editor.isActive("bold"),        () => editor.chain().focus().toggleBold().run(),        "Bold",          Bold)}
      {btn(editor.isActive("italic"),      () => editor.chain().focus().toggleItalic().run(),      "Italic",        Italic)}
      {btn(editor.isActive("underline"),   () => editor.chain().focus().toggleUnderline().run(),   "Underline",     Underline)}
      {btn(editor.isActive("strike"),      () => editor.chain().focus().toggleStrike().run(),      "Strikethrough", Strikethrough)}
      {btn(editor.isActive("subscript"),   () => editor.chain().focus().toggleSubscript().run(),   "Subscript",     Subscript)}
      {btn(editor.isActive("superscript"), () => editor.chain().focus().toggleSuperscript().run(), "Superscript",   Superscript)}

      {SEP}

      <button
        onMouseDown={(e) => { e.preventDefault(); onIntentClick(); }}
        className="px-2 py-1 rounded text-xs font-medium hover:bg-zinc-100 text-primary transition-colors"
        title="Add intent annotation"
      >
        ◈ Intent
      </button>
    </div>
  );
}

// ── IntentPopover ─────────────────────────────────────────────────────────────

function IntentPopover({
  x,
  y,
  isInline,
  isMultiParagraph,
  onApply,
  onClose,
}: {
  x: number;
  y: number;
  isInline: boolean;
  isMultiParagraph: boolean;
  onApply: (type: "field" | "condition" | "repeat", label: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<"field" | "condition" | "repeat" | null>(null);
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Field disabled for multi-paragraph; condition/repeat disabled for inline-only
  const fieldDisabled = isMultiParagraph;
  const blockDisabled = isInline;

  useEffect(() => {
    if (selected) inputRef.current?.focus();
  }, [selected]);

  function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !label.trim()) return;
    onApply(selected, label.trim());
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-72 rounded-lg border border-border bg-white shadow-lg p-3"
        style={{ left: x, top: y }}
      >
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Add intent</p>

        <div className="flex gap-1.5 mb-3">
          <IntentOption
            label="Field"
            description="Inline placeholder"
            active={selected === "field"}
            disabled={fieldDisabled}
            onClick={() => { setSelected("field"); setLabel(""); }}
          />
          <IntentOption
            label="Condition"
            description="Show/hide section"
            active={selected === "condition"}
            disabled={blockDisabled}
            onClick={() => { setSelected("condition"); setLabel(""); }}
          />
          <IntentOption
            label="Repeat"
            description="Loop section"
            active={selected === "repeat"}
            disabled={blockDisabled}
            onClick={() => { setSelected("repeat"); setLabel(""); }}
          />
        </div>

        {selected && (
          <form onSubmit={handleApply} className="flex flex-col gap-2">
            <Input
              ref={inputRef}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={
                selected === "field"
                  ? "e.g. customer's full name"
                  : selected === "condition"
                  ? "e.g. show only when invoice is paid"
                  : "e.g. one row per line item"
              }
              className="h-7 text-xs"
            />
            <div className="flex gap-1.5">
              <Button type="submit" size="sm" className="h-7 text-xs flex-1" disabled={!label.trim()}>
                Apply
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

function IntentOption({
  label,
  description,
  active,
  disabled,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
        disabled
          ? "opacity-40 cursor-not-allowed border-border"
          : active
          ? "border-primary bg-primary/5 text-primary"
          : "border-border hover:border-primary/40 hover:bg-zinc-50"
      }`}
    >
      <div className="font-medium">{label}</div>
      <div className="text-zinc-400 leading-tight">{description}</div>
    </button>
  );
}
