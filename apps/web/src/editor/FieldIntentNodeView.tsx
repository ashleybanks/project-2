import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";
import { getSchema, triggerResolve, patchMapping } from "@/lib/api";
import type { IntentMapping, MappingConfidence } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, ChevronDown, X } from "lucide-react";
import type { FieldIntentOptions } from "./FieldIntentNode";

interface NodeViewProps {
  node: PmNode;
  extension: { options: FieldIntentOptions };
  deleteNode: () => void;
  editor: Editor;
}

// ── Confidence helpers ────────────────────────────────────────────────────────

const CONF_SYMBOL: Record<MappingConfidence, string> = {
  high: "✓",
  medium: "·",
  low: "!",
  unresolved: "–",
};

const CONF_COLOR: Record<MappingConfidence, string> = {
  high: "text-emerald-600",
  medium: "text-primary",
  low: "text-amber-500",
  unresolved: "text-zinc-400",
};

// ── Field path picker ─────────────────────────────────────────────────────────

function collectPaths(
  schema: Record<string, unknown>,
  prefix = "",
  depth = 0,
): string[] {
  if (depth > 5) return [];
  const paths: string[] = [];
  const props = (schema.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  for (const [key, val] of Object.entries(props)) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths.push(path);
    if (val.type === "object" && val.properties) {
      paths.push(
        ...collectPaths(val as Record<string, unknown>, path, depth + 1),
      );
    }
    if (val.type === "array" && val.items && typeof val.items === "object") {
      const items = val.items as Record<string, unknown>;
      if (items.type === "object") {
        paths.push(...collectPaths(items, path, depth + 1));
      }
    }
  }
  return paths;
}

function FieldPicker({
  schema,
  onSelect,
  onClose,
}: {
  schema: Record<string, unknown>;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [manual, setManual] = useState("");
  const paths = collectPaths(schema);
  const filtered = search
    ? paths.filter((p) => p.toLowerCase().includes(search.toLowerCase()))
    : paths;

  return (
    <div className="mt-2 border-t border-border pt-2">
      <Input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search schema fields…"
        className="h-7 text-xs mb-1.5"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="max-h-28 overflow-y-auto mb-2">
        {filtered.slice(0, 20).map((path) => (
          <button
            key={path}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(path);
              onClose();
            }}
            className="w-full text-left px-2 py-0.5 text-xs rounded hover:bg-zinc-100 font-mono"
          >
            {path}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-1">No matches</p>
        )}
      </div>
      <div className="border-t border-border pt-1.5">
        <p className="text-xs text-muted-foreground mb-1">
          Enter path manually
        </p>
        <div className="flex gap-1">
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="e.g. customer.name"
            className="h-7 text-xs font-mono"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && manual.trim()) {
                onSelect(manual.trim());
                onClose();
              }
            }}
          />
          <Button
            size="sm"
            className="h-7 text-xs px-2"
            disabled={!manual.trim()}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(manual.trim());
              onClose();
            }}
          >
            Set
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Resolution popover ────────────────────────────────────────────────────────

function ResolutionPopover({
  intentKey,
  templateId,
  onSwitchToData,
  onClose,
}: {
  intentKey: string;
  templateId: string;
  onSwitchToData: (() => void) | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);

  const { data: schema, isLoading } = useQuery({
    queryKey: ["schema", templateId],
    queryFn: () => getSchema(templateId),
    retry: false,
  });

  const mapping: IntentMapping | undefined = schema?.mappings.find(
    (m) => m.intent_key === intentKey,
  );

  const retryMut = useMutation({
    mutationFn: () => triggerResolve(templateId, intentKey),
    onSuccess: () => {
      qc.setQueryData<import("@/lib/api").TemplateSchema>(
        ["schema", templateId],
        (old) => (old ? { ...old, resolving: true } : old),
      );
      qc.invalidateQueries({ queryKey: ["schema", templateId] });
    },
  });

  const patchMut = useMutation({
    mutationFn: (path: string) =>
      patchMapping(templateId, intentKey, { field_path: path }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schema", templateId] }),
  });

  const confidence = mapping?.confidence ?? "unresolved";
  const isUnresolved = confidence === "unresolved";
  const isLow = confidence === "low";

  return (
    <div
      className="absolute left-0 top-full mt-1 z-50 w-72 rounded-lg border border-border bg-white shadow-xl p-3 text-sm"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Resolution
        </p>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-zinc-100">
          <X className="w-3 h-3" />
        </button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !schema ? (
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            No schema uploaded for this template.
          </p>
          {onSwitchToData && (
            <button
              onClick={() => {
                onSwitchToData();
                onClose();
              }}
              className="text-xs text-primary hover:underline"
            >
              Go to Data tab ↗
            </button>
          )}
        </div>
      ) : !mapping ? (
        <p className="text-xs text-muted-foreground">
          No mapping found for this intent.
        </p>
      ) : isUnresolved ? (
        <div>
          <p className="text-xs text-amber-600 mb-2">
            This intent is not resolved.
          </p>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-6 text-xs flex-1"
              onClick={() => retryMut.mutate()}
              disabled={retryMut.isPending}
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              {retryMut.isPending ? "Retrying…" : "↺ Retry"}
            </Button>
            {onSwitchToData && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs"
                onClick={() => {
                  onSwitchToData();
                  onClose();
                }}
              >
                Fix in Data tab ↗
              </Button>
            )}
          </div>
          {showPicker ? (
            <FieldPicker
              schema={schema.raw_schema}
              onSelect={(path) => patchMut.mutate(path)}
              onClose={() => setShowPicker(false)}
            />
          ) : (
            <button
              onClick={() => setShowPicker(true)}
              className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ChevronDown className="w-3 h-3" /> Assign field manually
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* Field path */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-16 shrink-0">
              Path
            </span>
            <span className="text-xs font-mono truncate">
              {mapping.field_path ?? "—"}
            </span>
          </div>

          {/* Confidence */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-16 shrink-0">
              Confidence
            </span>
            <span className={`text-xs font-medium ${CONF_COLOR[confidence]}`}>
              {CONF_SYMBOL[confidence]} {confidence}
            </span>
          </div>

          {/* Type */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-16 shrink-0">
              Type
            </span>
            <span className="text-xs">{mapping.intent_type}</span>
          </div>

          {/* Alternatives (medium/low) */}
          {(isLow || confidence === "medium") &&
            mapping.alternatives.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0 mt-0.5">
                  Also
                </span>
                <div className="flex flex-wrap gap-1">
                  {mapping.alternatives.map((alt) => (
                    <button
                      key={alt}
                      onClick={() => patchMut.mutate(alt)}
                      className="text-xs font-mono text-primary hover:underline"
                    >
                      {alt}
                    </button>
                  ))}
                </div>
              </div>
            )}

          {/* Actions row */}
          <div className="flex items-center gap-1.5 pt-1 border-t border-border mt-2">
            <div className="relative flex-1">
              <button
                onClick={() => setShowPicker(!showPicker)}
                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Change <ChevronDown className="w-3 h-3" />
              </button>
              {showPicker && (
                <FieldPicker
                  schema={schema.raw_schema}
                  onSelect={(path) => patchMut.mutate(path)}
                  onClose={() => setShowPicker(false)}
                />
              )}
            </div>
            <button
              onClick={() => retryMut.mutate()}
              disabled={retryMut.isPending}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
            >
              <RefreshCw className="w-3 h-3" />
              {retryMut.isPending ? "…" : "Retry"}
            </button>
            {onSwitchToData && (
              <button
                onClick={() => {
                  onSwitchToData();
                  onClose();
                }}
                className="text-xs text-primary hover:underline ml-auto"
              >
                Data tab ↗
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main NodeView component ───────────────────────────────────────────────────

function FieldIntentNodeViewComponent({
  node,
  extension,
  deleteNode,
}: NodeViewProps) {
  const { templateId, onSwitchToData } = extension.options;
  const [popoverOpen, setPopoverOpen] = useState(false);

  const intentKey: string = node.attrs.key as string;
  const label: string = node.attrs.label as string;
  const displayName: string | null = node.attrs.display_name as string | null;
  const fieldPath: string | null = node.attrs.field_path as string | null;

  // Show display_name if available, otherwise label
  const chipLabel = displayName || label;

  // Simple resolved indicator from block model (no confidence level without schema query)
  const isResolved = !!fieldPath;

  return (
    <NodeViewWrapper
      as="span"
      className="relative inline-block"
      contentEditable={false}
    >
      <button
        onClick={() => setPopoverOpen((o) => !o)}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm leading-none cursor-pointer select-none border transition-colors ${
          isResolved
            ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
            : "bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200"
        }`}
        title={fieldPath ? `→ ${fieldPath}` : "Not resolved"}
      >
        <span className="text-xs font-medium">{chipLabel}</span>
        <ResolutionDot
          intentKey={intentKey}
          templateId={templateId}
          fieldPath={fieldPath}
        />
      </button>

      {popoverOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setPopoverOpen(false)}
          />
          <ResolutionPopover
            intentKey={intentKey}
            templateId={templateId}
            onSwitchToData={onSwitchToData}
            onClose={() => setPopoverOpen(false)}
          />
        </>
      )}
    </NodeViewWrapper>
  );
}

// Tiny dot that queries the schema for confidence
function ResolutionDot({
  intentKey,
  templateId,
  fieldPath,
}: {
  intentKey: string;
  templateId: string;
  fieldPath: string | null;
}) {
  const { data: schema } = useQuery({
    queryKey: ["schema", templateId],
    queryFn: () => getSchema(templateId),
    retry: false,
    staleTime: 30_000,
    enabled: !!templateId,
  });

  const mapping = schema?.mappings.find((m) => m.intent_key === intentKey);
  const confidence = mapping?.confidence;

  if (!schema) {
    // No schema: show nothing extra
    return null;
  }

  if (!confidence || confidence === "unresolved") {
    return <span className="text-zinc-400 text-xs leading-none">–</span>;
  }

  return (
    <span className={`text-xs leading-none ${CONF_COLOR[confidence]}`}>
      {CONF_SYMBOL[confidence]}
    </span>
  );
}

export const fieldIntentNodeViewRenderer = ReactNodeViewRenderer(
  FieldIntentNodeViewComponent as React.ComponentType<unknown>,
);
