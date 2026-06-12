import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSchema,
  uploadSchema,
  deleteSchema,
  triggerResolve,
  patchMapping,
  generateTestData,
  type IntentMapping,
  type MappingConfidence,
  type TemplateSchema,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, RefreshCw, ChevronDown, Eye, Download, X } from "lucide-react";

// ── Confidence indicator ──────────────────────────────────────────────────────

function ConfidenceDots({ confidence }: { confidence: MappingConfidence }) {
  const filled = { high: 3, medium: 2, low: 1, unresolved: 0 }[confidence];
  const color = {
    high: "text-emerald-500",
    medium: "text-primary",
    low: "text-amber-500",
    unresolved: "text-muted-foreground",
  }[confidence];
  return (
    <span className={`flex gap-0.5 shrink-0 ${color}`} title={confidence}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full border ${i < filled ? "bg-current border-current" : "border-current opacity-30"}`}
        />
      ))}
    </span>
  );
}

// ── Field path picker dropdown ────────────────────────────────────────────────

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
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border border-border bg-white shadow-lg p-2">
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search schema fields…"
          className="h-7 text-xs mb-2"
        />
        <div className="max-h-40 overflow-y-auto mb-2">
          {filtered.slice(0, 30).map((path) => (
            <button
              key={path}
              onClick={() => {
                onSelect(path);
                onClose();
              }}
              className="w-full text-left px-2 py-1 text-xs rounded hover:bg-zinc-50 font-mono"
            >
              {path}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1">
              No matches
            </p>
          )}
        </div>
        <div className="border-t border-border pt-2">
          <p className="text-xs text-muted-foreground mb-1">
            Enter path manually
          </p>
          <div className="flex gap-1">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="e.g. customer.name"
              className="h-7 text-xs font-mono"
              onKeyDown={(e) => {
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
              onClick={() => {
                onSelect(manual.trim());
                onClose();
              }}
            >
              Set
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function collectPaths(
  schema: Record<string, unknown>,
  prefix = "",
  depth = 0,
): string[] {
  if (depth > 5) return [];
  const paths: string[] = [];
  const properties = (schema.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  for (const [key, val] of Object.entries(properties)) {
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

// ── Mapping row ───────────────────────────────────────────────────────────────

function MappingRow({
  mapping,
  schema,
  depth = 0,
  templateId,
}: {
  mapping: IntentMapping;
  schema: Record<string, unknown>;
  depth?: number;
  templateId: string;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const patchMut = useMutation({
    mutationFn: (path: string) =>
      patchMapping(templateId, mapping.intent_key, { field_path: path }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schema", templateId] }),
  });

  const retryMut = useMutation({
    mutationFn: () => triggerResolve(templateId, mapping.intent_key),
    onSuccess: () => {
      qc.setQueryData<TemplateSchema>(["schema", templateId], (old) =>
        old ? { ...old, resolving: true } : old,
      );
      qc.invalidateQueries({ queryKey: ["schema", templateId] });
    },
  });

  const isLow = mapping.confidence === "low" || mapping.confidence === "medium";
  const isUnresolved = mapping.confidence === "unresolved";

  const typePrefix =
    mapping.intent_type === "repeat"
      ? "↻ "
      : mapping.intent_type === "condition"
        ? "⊘ "
        : "";

  return (
    <div className={`${depth > 0 ? "ml-5 border-l border-border pl-3" : ""}`}>
      <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-zinc-50 group relative">
        {/* Label */}
        <span className="text-xs text-muted-foreground shrink-0 w-4">
          {typePrefix}
        </span>
        <span className="text-xs flex-1 truncate" title={mapping.intent_label}>
          {mapping.intent_label}
        </span>

        {/* Arrow */}
        <span className="text-xs text-muted-foreground shrink-0">→</span>

        {/* Resolved path */}
        <span
          className={`text-xs font-mono flex-1 truncate ${isUnresolved ? "text-muted-foreground italic" : "text-foreground"}`}
        >
          {mapping.field_path ?? "not resolved"}
        </span>

        {/* Confidence */}
        <ConfidenceDots confidence={mapping.confidence} />

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            title="Retry resolution"
            onClick={() => retryMut.mutate()}
            disabled={retryMut.isPending}
            className="p-0.5 rounded hover:bg-zinc-100 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>

        {/* Fix / Change */}
        {(isUnresolved || isLow) && (
          <div className="relative">
            <button
              onClick={() => setShowPicker(!showPicker)}
              className={`flex items-center gap-0.5 text-xs px-2 py-0.5 rounded border transition-colors ${
                isUnresolved
                  ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {isUnresolved ? "Fix" : "Change"}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showPicker && (
              <FieldPicker
                schema={schema}
                onSelect={(path) => patchMut.mutate(path)}
                onClose={() => setShowPicker(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* Alternatives (medium/low) */}
      {isLow && mapping.alternatives.length > 0 && (
        <div className="ml-6 mb-1 flex flex-wrap gap-1">
          <span className="text-xs text-muted-foreground">also:</span>
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
      )}
    </div>
  );
}

// ── Test data table ───────────────────────────────────────────────────────────

function TestDataTable({
  records,
  schema,
}: {
  records: Record<string, unknown>[];
  schema: Record<string, unknown>;
}) {
  const [expandedCell, setExpandedCell] = useState<string | null>(null);
  const properties = (schema.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const columns = Object.keys(properties).slice(0, 12); // cap columns

  if (records.length === 0) return null;

  function formatCell(
    val: unknown,
    colKey: string,
    rowIdx: number,
  ): React.ReactNode {
    if (Array.isArray(val)) {
      const cellId = `${rowIdx}-${colKey}`;
      const isExpanded = expandedCell === cellId;
      return (
        <div>
          <button
            onClick={() => setExpandedCell(isExpanded ? null : cellId)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {val.length} {val.length === 1 ? "item" : "items"}
            <span>{isExpanded ? "▾" : "▸"}</span>
          </button>
          {isExpanded && (
            <div className="mt-1 border border-border rounded text-xs overflow-auto max-w-xs">
              <pre className="p-2 text-xs">{JSON.stringify(val, null, 2)}</pre>
            </div>
          )}
        </div>
      );
    }
    if (val === null || val === undefined)
      return <span className="text-muted-foreground">—</span>;
    return <span>{String(val)}</span>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="text-xs w-full">
        <thead>
          <tr className="border-b border-border bg-zinc-50">
            {columns.map((col) => (
              <th
                key={col}
                className="text-left px-3 py-2 font-medium text-muted-foreground font-mono whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((row, i) => (
            <tr
              key={i}
              className="border-b border-border last:border-0 hover:bg-zinc-50"
            >
              {columns.map((col) => (
                <td key={col} className="px-3 py-2 max-w-[180px] truncate">
                  {formatCell(row[col], col, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Schema viewer modal ───────────────────────────────────────────────────────

function SchemaModal({
  schema,
  onClose,
}: {
  schema: Record<string, unknown>;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-8 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border border-border bg-white shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-medium">Raw JSON Schema</span>
            <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <pre className="text-xs font-mono text-zinc-700 whitespace-pre-wrap">
              {JSON.stringify(schema, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main DataPane ─────────────────────────────────────────────────────────────

export default function DataPane({ templateId }: { templateId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [schemaModal, setSchemaModal] = useState(false);
  const [testRecords, setTestRecords] = useState<
    Record<string, unknown>[] | null
  >(null);
  const [testLoading, setTestLoading] = useState(false);
  const [resolveAllConfirm, setResolveAllConfirm] = useState(false);

  const { data: schema, isLoading } = useQuery({
    queryKey: ["schema", templateId],
    queryFn: () => getSchema(templateId),
    retry: false,
    refetchInterval: (query) => {
      // Poll while resolving
      return query.state.data?.resolving ? 2000 : false;
    },
  });

  const uploadMut = useMutation({
    mutationFn: (raw: Record<string, unknown>) => uploadSchema(templateId, raw),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schema", templateId] });
      setTestRecords(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteSchema(templateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schema", templateId] });
      setTestRecords(null);
    },
  });

  const resolveAllMut = useMutation({
    mutationFn: () => triggerResolve(templateId),
    onSuccess: () => {
      setResolveAllConfirm(false);
      // Optimistically mark as resolving so the spinner shows immediately,
      // before the first polling GET returns.
      qc.setQueryData<TemplateSchema>(["schema", templateId], (old) =>
        old ? { ...old, resolving: true } : old,
      );
      qc.invalidateQueries({ queryKey: ["schema", templateId] });
    },
  });

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (typeof parsed !== "object" || Array.isArray(parsed)) {
          alert("Invalid JSON Schema: must be a JSON object.");
          return;
        }
        uploadMut.mutate(parsed);
      } catch {
        alert("Could not read the file as JSON.");
      }
    },
    [uploadMut],
  );

  const handleGenerateTestData = useCallback(async () => {
    setTestLoading(true);
    try {
      const records = await generateTestData(templateId, 10);
      setTestRecords(records);
    } catch (e) {
      alert(
        `Failed to generate test data: ${e instanceof Error ? e.message : e}`,
      );
    } finally {
      setTestLoading(false);
    }
  }, [templateId]);

  const handleExportTestData = useCallback(() => {
    if (!testRecords) return;
    const blob = new Blob([JSON.stringify(testRecords, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "test-data.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [testRecords]);

  // Group mappings by parent_key for rendering
  function renderMappings(s: TemplateSchema) {
    const rawSchema = s.raw_schema;
    const topLevel = s.mappings.filter((m) => !m.parent_key);
    const byParent = new Map<string, IntentMapping[]>();
    for (const m of s.mappings) {
      if (m.parent_key) {
        const arr = byParent.get(m.parent_key) ?? [];
        arr.push(m);
        byParent.set(m.parent_key, arr);
      }
    }

    return topLevel.map((m) => (
      <div key={m.intent_key}>
        <MappingRow mapping={m} schema={rawSchema} templateId={templateId} />
        {(byParent.get(m.intent_key) ?? []).map((child) => (
          <MappingRow
            key={child.intent_key}
            mapping={child}
            schema={rawSchema}
            depth={1}
            templateId={templateId}
          />
        ))}
      </div>
    ));
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-8 pt-6 pb-8 space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ── Schema section ── */}
      <section>
        <h3 className="text-sm font-semibold mb-3">Schema</h3>

        {!schema ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Upload a JSON Schema to enable mappings, test data, and merge
              validation.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploadMut.isPending}
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              {uploadMut.isPending ? "Uploading…" : "Upload JSON Schema"}
            </Button>
            {uploadMut.isError && (
              <p className="text-xs text-destructive mt-2">
                {uploadMut.error?.message}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-border px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {countSchemaFields(schema.raw_schema)} fields
              </p>
              <p className="text-xs text-muted-foreground">
                Uploaded {new Date(schema.created_at).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => setSchemaModal(true)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Eye className="w-3 h-3" /> View
            </button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => fileRef.current?.click()}
              disabled={uploadMut.isPending}
            >
              Replace
            </Button>
          </div>
        )}
      </section>

      {/* ── Mappings section ── */}
      {schema && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Mappings</h3>
            {resolveAllConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Replace all mappings?
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs"
                  onClick={() => setResolveAllConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => resolveAllMut.mutate()}
                  disabled={resolveAllMut.isPending}
                >
                  {resolveAllMut.isPending ? "Running…" : "Confirm"}
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setResolveAllConfirm(true)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Re-resolve all
              </button>
            )}
          </div>

          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {schema.resolving && (
              <div className="px-4 py-2.5 flex items-center gap-2 text-xs text-muted-foreground border-b border-border">
                <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                Resolving…
              </div>
            )}
            {!schema.resolving && schema.mappings.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                No intents found in template.
              </div>
            ) : schema.mappings.length > 0 ? (
              <div className="py-1">{renderMappings(schema)}</div>
            ) : null}
          </div>
        </section>
      )}

      {/* ── Test data section ── */}
      {schema && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Test data</h3>
            {testRecords && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {testRecords.length} records
                </span>
                <button
                  onClick={handleExportTestData}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> Export JSON
                </button>
              </div>
            )}
          </div>

          {!testRecords ? (
            <div className="rounded-lg border border-dashed border-border p-5 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                Generate sample records to verify your schema and mappings.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateTestData}
                disabled={testLoading}
              >
                {testLoading ? "Generating…" : "Generate 10 records"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <TestDataTable records={testRecords} schema={schema.raw_schema} />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handleGenerateTestData}
                disabled={testLoading}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                {testLoading ? "Generating…" : "Regenerate"}
              </Button>
            </div>
          )}
        </section>
      )}

      {schemaModal && schema && (
        <SchemaModal
          schema={schema.raw_schema}
          onClose={() => setSchemaModal(false)}
        />
      )}
    </div>
  );
}

function countSchemaFields(schema: Record<string, unknown>, depth = 0): number {
  if (depth > 4) return 0;
  const properties = (schema.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  let count = Object.keys(properties).length;
  for (const val of Object.values(properties)) {
    if (val.type === "object")
      count += countSchemaFields(val as Record<string, unknown>, depth + 1);
  }
  return count;
}
