import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";
import { Node as PmNode } from "@tiptap/pm/model";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SectionNodeViewProps {
  node: PmNode;
  updateAttributes: (attrs: Record<string, unknown>) => void;
}

export function SectionNodeViewComponent({ node, updateAttributes }: SectionNodeViewProps) {
  const { conditionIntent, repeatIntent } = node.attrs as {
    conditionIntent: string | null;
    repeatIntent: string | null;
  };
  const intent = conditionIntent ?? repeatIntent ?? null;
  const hasIntent = !!intent;

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  function startEdit() {
    setEditValue(intent ?? "");
    setEditing(true);
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    const v = editValue.trim();
    if (conditionIntent !== null) {
      updateAttributes({ conditionIntent: v || null });
    } else {
      updateAttributes({ repeatIntent: v || null });
    }
    setEditing(false);
  }

  function clearIntent() {
    updateAttributes({ conditionIntent: null, repeatIntent: null });
    setEditing(false);
  }

  return (
    <NodeViewWrapper
      className={`section-node${hasIntent ? " section-node--annotated" : ""}`}
      data-section=""
    >
      {hasIntent && (
        <div className="flex items-start gap-1.5 mb-1" contentEditable={false}>
          <button
            className="text-primary text-xs font-medium hover:opacity-70 flex items-center gap-1 select-none"
            onClick={startEdit}
            title="Edit intent"
          >
            ◈ {intent && intent.length > 40 ? intent.slice(0, 40) + "…" : intent}
          </button>
        </div>
      )}

      {editing && (
        <form
          onSubmit={saveEdit}
          className="flex items-center gap-1.5 mb-2"
          contentEditable={false}
        >
          <Input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="h-7 text-xs"
            placeholder="Describe intent…"
          />
          <Button type="submit" size="sm" className="h-7 text-xs px-2">Save</Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={clearIntent}>
            Remove
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      )}

      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export const sectionNodeViewRenderer = ReactNodeViewRenderer(SectionNodeViewComponent);
