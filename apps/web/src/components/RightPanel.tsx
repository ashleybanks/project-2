import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listVersions, createVersion, restoreVersion, updateTemplate } from "../lib/api";
import type { StylesheetDef, TemplateDetail, VersionSummary, PtTopLevel } from "../lib/api";
import { useEditor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight } from "lucide-react";
import StylesheetEditorCompact from "@/components/StylesheetEditorCompact";
import { deriveVisibleStyles } from "@/lib/styleUtils";

type Tab = "map" | "stylesheet" | "history";

interface Props {
  templateId: string;
  stylesheet: StylesheetDef;
  blocks: PtTopLevel[];
  editorRef: React.MutableRefObject<ReturnType<typeof useEditor> | null>;
  onCreateCheckpoint: (label: string) => Promise<VersionSummary>;
  onRestore: (template: TemplateDetail) => void;
  onStylesheetChange: (s: StylesheetDef) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export default function RightPanel({ templateId, stylesheet, blocks, editorRef, onCreateCheckpoint, onRestore, onStylesheetChange, collapsed, onCollapsedChange }: Props) {
  const storageKey = `rp-tab-${templateId}`;

  const [tab, setTab] = useState<Tab>(() => {
    return (localStorage.getItem(storageKey) as Tab) ?? "map";
  });

  function switchTab(t: Tab) {
    setTab(t);
    localStorage.setItem(storageKey, t);
  }

  function toggleCollapsed() {
    onCollapsedChange(!collapsed);
  }

  return (
    <aside
      className={`${collapsed ? "w-10" : "w-72"} transition-[width] duration-200 ease-in-out border-l border-border bg-white flex flex-col overflow-hidden shrink-0`}
    >
      {collapsed ? (
        /* Collapsed strip — just an expand button */
        <div className="flex flex-col items-center pt-2.5">
          <button
            onClick={toggleCollapsed}
            title="Expand panel"
            className="p-1.5 rounded hover:bg-zinc-100 text-muted-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex border-b border-border">
            {(["map", "stylesheet", "history"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${
                  tab === t
                    ? "text-primary border-b-2 border-primary -mb-px bg-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "map" ? "Doc Map" : t === "stylesheet" ? "Styles" : "History"}
              </button>
            ))}
            <button
              onClick={toggleCollapsed}
              title="Collapse panel"
              className="px-2 text-muted-foreground hover:text-foreground hover:bg-zinc-50 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {tab === "map"        && <DocumentMapTab editorRef={editorRef} />}
            {tab === "stylesheet" && (
              <StylesheetTab
                templateId={templateId}
                stylesheet={stylesheet}
                blocks={blocks}
                onStylesheetChange={onStylesheetChange}
              />
            )}
            {tab === "history"    && (
              <HistoryTab
                templateId={templateId}
                onCreateCheckpoint={onCreateCheckpoint}
                onRestore={onRestore}
              />
            )}
          </div>
        </>
      )}
    </aside>
  );
}

// ── Document Map ──────────────────────────────────────────────────────────────

interface MapEntry {
  label: string;
  indent: number;
  pos: number;
  isIntent: boolean;
}

function DocumentMapTab({ editorRef }: { editorRef: React.MutableRefObject<ReturnType<typeof useEditor> | null> }) {
  const [entries, setEntries] = useState<MapEntry[]>([]);
  const [highlighted, setHighlighted] = useState<number | null>(null);

  useEffect(() => {
    function rebuild() {
      const editor = editorRef.current;
      if (!editor) return;

      const newEntries: MapEntry[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          const level = node.attrs.level as number;
          newEntries.push({
            label: node.textContent || `Heading ${level}`,
            indent: level - 1,
            pos,
            isIntent: false,
          });
        } else if (node.type.name === "section") {
          const intent = (node.attrs.conditionIntent ?? node.attrs.repeatIntent) as string | null;
          if (intent) {
            newEntries.push({
              label: `◈ ${intent.length > 30 ? intent.slice(0, 30) + "…" : intent}`,
              indent: 0,
              pos,
              isIntent: true,
            });
          }
        }
      });
      setEntries(newEntries);
    }

    // Poll until editor is ready, then subscribe to updates
    const poll = setInterval(() => {
      const editor = editorRef.current;
      if (editor) {
        clearInterval(poll);
        rebuild();
        editor.on("update", rebuild);
      }
    }, 200);

    return () => {
      clearInterval(poll);
      const editor = editorRef.current;
      if (editor) editor.off("update", rebuild);
    };
  }, [editorRef]);

  function navigateTo(pos: number) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.commands.setTextSelection(pos + 1);
    editor.commands.scrollIntoView();
    setHighlighted(pos);
    setTimeout(() => setHighlighted(null), 1200);
  }

  if (entries.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Document structure will appear here as you add headings and intents.
      </div>
    );
  }

  return (
    <div className="py-2">
      {entries.map((entry, i) => (
        <button
          key={i}
          onClick={() => navigateTo(entry.pos)}
          className={`w-full text-left px-4 py-1.5 text-sm transition-colors rounded-none hover:bg-zinc-50 ${
            highlighted === entry.pos ? "bg-primary/10 text-primary" : ""
          } ${entry.isIntent ? "text-primary/80 font-medium" : "text-foreground"}`}
          style={{ paddingLeft: `${(entry.indent + 1) * 12}px` }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

// ── Stylesheet ─────────────────────────────────────────────────────────────────

function StylesheetTab({
  templateId,
  stylesheet,
  blocks,
  onStylesheetChange,
}: {
  templateId: string;
  stylesheet: StylesheetDef;
  blocks: PtTopLevel[];
  onStylesheetChange: (s: StylesheetDef) => void;
}) {
  const [draft, setDraft] = useState<StylesheetDef>(stylesheet);
  const prevPropRef = useRef(stylesheet);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (stylesheet !== prevPropRef.current) {
      prevPropRef.current = stylesheet;
      setDraft(stylesheet);
    }
  }, [stylesheet]);

  const saveMut = useMutation({
    mutationFn: (s: StylesheetDef) => updateTemplate(templateId, { stylesheet: s }),
  });

  function handleChange(next: StylesheetDef) {
    setDraft(next);
    onStylesheetChange(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveMut.mutate(next);
    }, 2000);
  }

  const visibleStyles = deriveVisibleStyles(blocks);

  return (
    <StylesheetEditorCompact
      value={draft}
      onChange={handleChange}
      visibleStyles={visibleStyles}
      storageKey={`template-${templateId}`}
    />
  );
}

// ── History ───────────────────────────────────────────────────────────────────

function HistoryTab({
  templateId,
  onCreateCheckpoint,
  onRestore,
}: {
  templateId: string;
  onCreateCheckpoint: (label: string) => Promise<VersionSummary>;
  onRestore: (template: TemplateDetail) => void;
}) {
  const qc = useQueryClient();
  const [checkpointLabel, setCheckpointLabel] = useState("");
  const [creatingCheckpoint, setCreatingCheckpoint] = useState(false);
  const [savingCheckpoint, setSavingCheckpoint] = useState(false);

  const { data: versions, isLoading } = useQuery({
    queryKey: ["versions", templateId],
    queryFn: () => listVersions(templateId),
    refetchInterval: 30_000,
  });

  const restoreMut = useMutation({
    mutationFn: (versionId: string) => restoreVersion(templateId, versionId),
    onSuccess: (result) => {
      onRestore(result);
      qc.invalidateQueries({ queryKey: ["versions", templateId] });
    },
  });

  async function handleCreateCheckpoint(e: React.FormEvent) {
    e.preventDefault();
    const label = checkpointLabel.trim();
    if (!label) return;
    setSavingCheckpoint(true);
    await onCreateCheckpoint(label);
    setSavingCheckpoint(false);
    setCheckpointLabel("");
    setCreatingCheckpoint(false);
    qc.invalidateQueries({ queryKey: ["versions", templateId] });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Create checkpoint */}
      <div className="p-3 border-b border-border">
        {creatingCheckpoint ? (
          <form onSubmit={handleCreateCheckpoint} className="flex flex-col gap-1.5">
            <Input
              autoFocus
              value={checkpointLabel}
              onChange={(e) => setCheckpointLabel(e.target.value)}
              placeholder="Checkpoint name…"
              className="h-8 text-sm"
            />
            <div className="flex gap-1">
              <Button type="submit" size="sm" className="h-8 text-sm flex-1" disabled={savingCheckpoint || !checkpointLabel.trim()}>
                {savingCheckpoint ? "Saving…" : "Save checkpoint"}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 text-sm" onClick={() => setCreatingCheckpoint(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button size="sm" variant="outline" className="w-full h-8 text-sm" onClick={() => setCreatingCheckpoint(true)}>
            + Create checkpoint
          </Button>
        )}
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="p-4 text-sm text-muted-foreground">Loading history…</p>
        )}
        {!isLoading && (!versions || versions.length === 0) && (
          <p className="p-4 text-sm text-muted-foreground">No history yet. Auto-saves appear here.</p>
        )}
        {versions?.map((v) => (
          <VersionRow
            key={v.id}
            version={v}
            onRestore={() => restoreMut.mutate(v.id)}
          />
        ))}
      </div>
    </div>
  );
}

function VersionRow({ version, onRestore }: { version: VersionSummary; onRestore: () => void }) {
  const isCheckpoint = !!version.label;
  const date = new Date(version.created_at);
  const dateStr = date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`flex items-center justify-between px-3 py-2 border-b border-border/50 hover:bg-zinc-50 group ${isCheckpoint ? "bg-amber-50/40" : ""}`}>
      <div className="min-w-0">
        <p className={`text-sm truncate ${isCheckpoint ? "font-semibold text-amber-800" : "text-muted-foreground"}`}>
          {isCheckpoint ? version.label : "Auto-save"}
        </p>
        <p className="text-xs text-muted-foreground/60">{dateStr}</p>
      </div>
      <button
        onClick={onRestore}
        className="text-sm text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:underline shrink-0 ml-2"
      >
        Restore
      </button>
    </div>
  );
}
