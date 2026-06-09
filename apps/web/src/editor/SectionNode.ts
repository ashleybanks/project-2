import { Node, mergeAttributes } from "@tiptap/core";
import type { NodeViewRenderer } from "@tiptap/core";

export interface SectionOptions {
  nodeViewRenderer: NodeViewRenderer | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    section: {
      setConditionIntent: (intent: string) => ReturnType;
      setRepeatIntent: (intent: string) => ReturnType;
      clearSectionIntent: () => ReturnType;
      wrapInSection: (attrs?: { conditionIntent?: string; repeatIntent?: string }) => ReturnType;
    };
  }
}

export const SectionNode = Node.create<SectionOptions>({
  name: "section",
  group: "block",
  content: "block+",
  defining: true,

  addOptions() {
    return { nodeViewRenderer: null };
  },

  addAttributes() {
    return {
      conditionIntent: { default: null },
      repeatIntent: { default: null },
      key: { default: () => `s${Date.now()}` },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-section]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const hasIntent = node.attrs.conditionIntent || node.attrs.repeatIntent;
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-section": "",
        "data-condition-intent": node.attrs.conditionIntent ?? undefined,
        "data-repeat-intent": node.attrs.repeatIntent ?? undefined,
        class: hasIntent
          ? "section-node section-node--annotated"
          : "section-node",
      }),
      0,
    ];
  },

  addNodeView() {
    return this.options.nodeViewRenderer ?? (null as unknown as NodeViewRenderer);
  },

  addCommands() {
    return {
      setConditionIntent:
        (intent: string) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { conditionIntent: intent, repeatIntent: null }),

      setRepeatIntent:
        (intent: string) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { repeatIntent: intent, conditionIntent: null }),

      clearSectionIntent:
        () =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { conditionIntent: null, repeatIntent: null }),

      wrapInSection:
        (attrs = {}) =>
        ({ state, dispatch }) => {
          const { selection } = state;
          const { from, to } = selection;
          const $from = state.doc.resolve(from);
          const $to = state.doc.resolve(to);
          const range = $from.blockRange($to);
          if (!range) return false;

          const sectionType = state.schema.nodes.section;
          if (!sectionType) return false;

          if (dispatch) {
            const tr = state.tr;
            tr.wrap(range, [{ type: sectionType, attrs: { ...attrs, key: `s${Date.now()}` } }]);
            dispatch(tr);
          }
          return true;
        },
    };
  },
});
