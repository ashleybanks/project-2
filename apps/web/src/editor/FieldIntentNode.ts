import { Node, mergeAttributes } from "@tiptap/core";
import type { NodeViewRenderer } from "@tiptap/core";

export interface FieldIntentOptions {
  HTMLAttributes: Record<string, unknown>;
  nodeViewRenderer: NodeViewRenderer | null;
  templateId: string;
  onSwitchToData: (() => void) | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fieldIntent: {
      setFieldIntent: (label: string) => ReturnType;
      removeFieldIntent: () => ReturnType;
    };
  }
}

export const FieldIntentNode = Node.create<FieldIntentOptions>({
  name: "fieldIntent",
  group: "inline",
  inline: true,
  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      nodeViewRenderer: null,
      templateId: "",
      onSwitchToData: null,
    };
  },

  addAttributes() {
    return {
      label: { default: "" },
      key: { default: () => `fi${Date.now()}` },
      display_name: { default: null },
      field_path: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-field-intent]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-field-intent": "",
        style:
          "display:inline-block;background:#e8f0fe;color:#1a56db;border:1px solid #a4cafe;" +
          "border-radius:4px;padding:1px 6px;font-size:0.85em;cursor:pointer;user-select:none;",
      }),
      `[${HTMLAttributes.display_name || HTMLAttributes.label}]`,
    ];
  },

  addNodeView() {
    return (
      this.options.nodeViewRenderer ?? (null as unknown as NodeViewRenderer)
    );
  },

  addCommands() {
    return {
      setFieldIntent:
        (label: string) =>
        ({ chain }) => {
          return chain()
            .deleteSelection()
            .insertContent({
              type: this.name,
              attrs: {
                label,
                key: `fi${Date.now()}`,
                display_name: null,
                field_path: null,
              },
            })
            .run();
        },
      removeFieldIntent:
        () =>
        ({ commands }) => {
          return commands.deleteSelection();
        },
    };
  },
});
