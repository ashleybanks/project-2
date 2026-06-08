import { useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Heading from "@tiptap/extension-heading";
import Underline from "@tiptap/extension-underline";
import { FieldIntentNode } from "../editor/FieldIntentNode";
import { ptToProsemirror, prosemirrorToPt } from "../lib/pt-bridge";
import type { Block, PtBlock } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}

export default function BlockCanvas({ blocks, onChange }: Props) {
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  const updateBlock = useCallback((idx: number, updated: Block) => {
    const next = [...blocks]; next[idx] = updated; onChange(next);
  }, [blocks, onChange]);

  const moveBlock = useCallback((idx: number, dir: -1 | 1) => {
    const next = [...blocks];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }, [blocks, onChange]);

  const removeIntent = useCallback((idx: number, intent: "conditionIntent" | "repeatIntent") => {
    const next = [...blocks];
    const b = { ...next[idx] };
    delete b[intent];
    next[idx] = b;
    onChange(next);
  }, [blocks, onChange]);

  const addBlock = useCallback((type: "text" | "divider") => {
    const newBlock: Block = type === "text"
      ? { type: "text", style_class: "body", content: [{ _type: "block", _key: `k${Date.now()}`, style: "normal", children: [] }] }
      : { type: "divider" };
    onChange([...blocks, newBlock]);
  }, [blocks, onChange]);

  return (
    <div>
      <div className="space-y-1">
        {blocks.map((block, idx) => (
          <BlockRow
            key={idx}
            block={block}
            idx={idx}
            focused={focusedIdx === idx}
            onFocus={() => setFocusedIdx(idx)}
            onBlur={() => setFocusedIdx(prev => prev === idx ? null : prev)}
            onChange={b => updateBlock(idx, b)}
            onMoveUp={() => moveBlock(idx, -1)}
            onMoveDown={() => moveBlock(idx, 1)}
            onRemoveIntent={removeIntent}
            isFirst={idx === 0}
            isLast={idx === blocks.length - 1}
          />
        ))}
      </div>

      <div className="flex gap-2 mt-4 pt-4 border-t border-dashed border-border">
        <Button variant="ghost" size="sm" className="text-muted-foreground text-xs" onClick={() => addBlock("text")}>
          + Text block
        </Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground text-xs" onClick={() => addBlock("divider")}>
          + Divider
        </Button>
      </div>
    </div>
  );
}

// ── BlockRow ──────────────────────────────────────────────────────────────────

interface BlockRowProps {
  block: Block; idx: number; focused: boolean;
  onFocus: () => void; onBlur: () => void;
  onChange: (b: Block) => void;
  onMoveUp: () => void; onMoveDown: () => void;
  onRemoveIntent: (idx: number, intent: "conditionIntent" | "repeatIntent") => void;
  isFirst: boolean; isLast: boolean;
}

function BlockRow({ block, idx, focused, onFocus, onBlur, onChange, onMoveUp, onMoveDown, onRemoveIntent, isFirst, isLast }: BlockRowProps) {
  return (
    <div
      className={`group rounded-md px-3 py-2 transition-colors ${focused ? "bg-white ring-1 ring-border shadow-sm" : "hover:bg-white/60"}`}
      onFocus={onFocus}
    >
      {/* Intent badges */}
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {block.conditionIntent && (
          <Badge variant="outline" className="text-xs gap-1.5 border-blue-200 text-blue-700 bg-blue-50">
            Condition: {block.conditionIntent}
            <button onClick={() => onRemoveIntent(idx, "conditionIntent")} className="hover:opacity-70 font-bold">×</button>
          </Badge>
        )}
        {block.repeatIntent && (
          <Badge variant="outline" className="text-xs gap-1.5 border-green-200 text-green-700 bg-green-50">
            Repeats: {block.repeatIntent}
            <button onClick={() => onRemoveIntent(idx, "repeatIntent")} className="hover:opacity-70 font-bold">×</button>
          </Badge>
        )}
      </div>

      {/* Content */}
      {block.type === "divider"
        ? <hr className="border-border my-1" />
        : <TextBlockEditor block={block} onChange={onChange} onBlur={onBlur} />
      }

      {/* Toolbar — visible on focus */}
      {focused && (
        <BlockToolbar
          block={block} onChange={onChange}
          onMoveUp={onMoveUp} onMoveDown={onMoveDown}
          isFirst={isFirst} isLast={isLast}
        />
      )}
    </div>
  );
}

// ── TextBlockEditor ───────────────────────────────────────────────────────────

function TextBlockEditor({ block, onChange, onBlur }: { block: Block; onChange: (b: Block) => void; onBlur: () => void }) {
  const ptBlocks = block.content ?? [];
  const pmDoc = ptToProsemirror(ptBlocks as PtBlock[]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Heading.configure({ levels: [1, 2, 3] }),
      Underline,
      FieldIntentNode,
    ],
    content: pmDoc,
    onUpdate: ({ editor }) => {
      const pmJson = editor.getJSON();
      const newPt = prosemirrorToPt(pmJson as { content?: Parameters<typeof prosemirrorToPt>[0]["content"] });
      onChange({ ...block, content: newPt as PtBlock[] });
    },
    onBlur,
    editorProps: {
      attributes: {
        class: "outline-none min-h-[1.5rem] prose prose-sm max-w-none prose-zinc",
      },
    },
  });

  return <EditorContent editor={editor} />;
}

// ── BlockToolbar ──────────────────────────────────────────────────────────────

function BlockToolbar({ block, onChange, onMoveUp, onMoveDown, isFirst, isLast }: {
  block: Block; onChange: (b: Block) => void;
  onMoveUp: () => void; onMoveDown: () => void;
  isFirst: boolean; isLast: boolean;
}) {
  const [fieldPrompt, setFieldPrompt] = useState<string | null>(null);

  function promptConditionIntent() {
    const desc = prompt("When should this block appear?\ne.g. 'show only when invoice is paid'");
    if (desc) onChange({ ...block, conditionIntent: desc, repeatIntent: undefined });
  }

  function promptRepeatIntent() {
    const desc = prompt("What does this block repeat over?\ne.g. 'one row per line item'");
    if (desc) onChange({ ...block, repeatIntent: desc, conditionIntent: undefined });
  }

  return (
    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/60">
      {fieldPrompt !== null ? (
        <form
          className="flex items-center gap-1.5 flex-1"
          onSubmit={e => {
            e.preventDefault();
            const label = fieldPrompt.trim();
            if (label) alert(`Select text in the block first — the label "${label}" will be applied to your selection.`);
            setFieldPrompt(null);
          }}
        >
          <Input
            autoFocus
            value={fieldPrompt}
            onChange={e => setFieldPrompt(e.target.value)}
            placeholder="Field label, e.g. customer's full name"
            className="h-6 text-xs"
          />
          <Button type="submit" size="sm" variant="secondary" className="h-6 text-xs px-2">Apply</Button>
          <Button type="button" size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setFieldPrompt(null)}>Cancel</Button>
        </form>
      ) : (
        <>
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setFieldPrompt("")}>Mark as field</Button>
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={promptConditionIntent}>Conditional</Button>
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={promptRepeatIntent}>Repeating</Button>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onMoveUp} disabled={isFirst}>↑</Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onMoveDown} disabled={isLast}>↓</Button>
        </>
      )}
    </div>
  );
}
