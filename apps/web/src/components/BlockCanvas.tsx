import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Heading from "@tiptap/extension-heading";
import Underline from "@tiptap/extension-underline";
import { FieldIntentNode } from "../editor/FieldIntentNode";
import { SectionNode } from "../editor/SectionNode";
import { sectionNodeViewRenderer } from "../editor/SectionNodeView";
import { ptToProsemirror, prosemirrorToPt } from "../lib/pt-bridge";
import type { PtTopLevel } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      StarterKit.configure({ heading: false, underline: false }),
      Heading.configure({ levels: [1, 2, 3] }),
      Underline,
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

function FormattingToolbar({
  editor,
  onIntentClick,
}: {
  editor: ReturnType<typeof useEditor> | null;
  onIntentClick: () => void;
}) {
  if (!editor) return null;

  const btn = (active: boolean, onClick: () => void, label: string) => (
    <button
      key={label}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-zinc-100 text-zinc-600"
      }`}
      title={label}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-1 py-1 rounded-md border border-border bg-white shadow-sm flex-wrap">
      {btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "B")}
      {btn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "I")}
      {btn(editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), "U")}
      <div className="w-px h-4 bg-border mx-0.5" />
      {btn(editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), "H1")}
      {btn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "H2")}
      {btn(editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "H3")}
      <div className="w-px h-4 bg-border mx-0.5" />
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
