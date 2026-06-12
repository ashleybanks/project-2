import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTemplate,
  updateTemplate,
  createVersion,
  triggerResolve,
} from "../lib/api";
import type {
  PtTopLevel,
  TemplateDetail,
  StylesheetDef,
  PtBlock,
  PtSection,
  PtTable,
} from "../lib/api";
import BlockCanvas from "../components/BlockCanvas";
import PreviewPane from "../components/PreviewPane";
import RightPanel from "../components/RightPanel";
import DataPane from "../components/DataPane";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useEditor } from "@tiptap/react";
import { PenLine, Eye, Database } from "lucide-react";

function extractIntentLabels(blocks: PtTopLevel[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const block of blocks) {
    if (block._type === "block") {
      for (const child of (block as PtBlock).children) {
        if (child._type === "fieldIntent") result.set(child._key, child.label);
      }
    } else if (block._type === "section") {
      const s = block as PtSection;
      const label = s.conditionIntent ?? s.repeatIntent;
      if (label) result.set(s._key, label);
      for (const inner of s.content) {
        if (inner._type === "block") {
          for (const child of inner.children) {
            if (child._type === "fieldIntent")
              result.set(child._key, child.label);
          }
        }
      }
    } else if (block._type === "table") {
      for (const row of (block as PtTable).rows) {
        for (const cell of row.cells) {
          for (const cellBlock of cell.content) {
            for (const child of cellBlock.children) {
              if (child._type === "fieldIntent")
                result.set(child._key, child.label);
            }
          }
        }
      }
    }
  }
  return result;
}

export default function TemplatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: templateData, isLoading } = useQuery({
    queryKey: ["template", id],
    queryFn: () => getTemplate(id!),
    enabled: !!id,
    gcTime: 0,
  });

  const [name, setName] = useState("");
  const [blocks, setBlocks] = useState<PtTopLevel[]>([]);
  const [stylesheet, setStylesheet] = useState<StylesheetDef>({});
  const [templateDetail, setTemplateDetail] = useState<TemplateDetail | null>(
    null,
  );
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [canvasKey, setCanvasKey] = useState(0);
  const [mode, setMode] = useState<"build" | "preview" | "data">("build");
  const [panelCollapsed, setPanelCollapsed] = useState(() => {
    return localStorage.getItem(`rp-collapsed-${id}`) === "true";
  });

  function handlePanelCollapsedChange(next: boolean) {
    setPanelCollapsed(next);
    localStorage.setItem(`rp-collapsed-${id}`, String(next));
  }

  function handleModeChange(next: "build" | "preview" | "data") {
    if ((next === "preview" || next === "data") && !panelCollapsed) {
      handlePanelCollapsedChange(true);
    }
    setMode(next);
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);
  const prevIntentsRef = useRef<Map<string, string>>(new Map());
  const pendingResolutionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (templateData) {
      setTemplateDetail(templateData);
      setName(templateData.name);
      setBlocks(templateData.block_model.blocks);
      setStylesheet(templateData.stylesheet);
      prevIntentsRef.current = extractIntentLabels(
        templateData.block_model.blocks,
      );
    }
  }, [templateData]);

  const saveMut = useMutation({
    mutationFn: (data: {
      name?: string;
      block_model?: { blocks: PtTopLevel[] };
    }) => updateTemplate(id!, data),
    onSuccess: () => {
      setSaveStatus("saved");
      qc.invalidateQueries({ queryKey: ["templates"] });
      setTimeout(() => setSaveStatus("idle"), 2000);

      const keys = Array.from(pendingResolutionsRef.current);
      pendingResolutionsRef.current.clear();
      if (keys.length > 0) {
        Promise.all(
          keys.map((k) => triggerResolve(id!, k).catch(() => {})),
        ).then(() =>
          setTimeout(
            () => qc.invalidateQueries({ queryKey: ["schema", id] }),
            2500,
          ),
        );
      }
    },
  });

  function scheduleAutoSave(newBlocks: PtTopLevel[], newName: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus("saving");
    debounceRef.current = setTimeout(() => {
      saveMut.mutate({ name: newName, block_model: { blocks: newBlocks } });
    }, 2000);
  }

  function handleBlocksChange(newBlocks: PtTopLevel[]) {
    const newIntents = extractIntentLabels(newBlocks);
    for (const [key, label] of newIntents) {
      if (
        !prevIntentsRef.current.has(key) ||
        prevIntentsRef.current.get(key) !== label
      ) {
        pendingResolutionsRef.current.add(key);
      }
    }
    prevIntentsRef.current = newIntents;
    setBlocks(newBlocks);
    scheduleAutoSave(newBlocks, name);
  }

  function handleNameChange(newName: string) {
    setName(newName);
    scheduleAutoSave(blocks, newName);
  }

  function handleRestore(restoredTemplate: TemplateDetail) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus("idle");
    setTemplateDetail(restoredTemplate);
    setName(restoredTemplate.name);
    setBlocks(restoredTemplate.block_model.blocks);
    setStylesheet(restoredTemplate.stylesheet);
    setCanvasKey((k) => k + 1);
    qc.setQueryData(["template", id], restoredTemplate);
    qc.invalidateQueries({ queryKey: ["template", id] });
  }

  if (isLoading)
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );

  if (!templateDetail)
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Template not found.</p>
      </div>
    );

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Template header */}
      <header className="border-b border-border bg-white px-6 py-2.5 flex items-center gap-4 shrink-0">
        <button
          onClick={() => navigate("/app/templates")}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Templates
        </button>
        <Separator orientation="vertical" className="h-8" />
        <Input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="border-none shadow-none text-sm font-medium p-0 h-auto focus-visible:ring-0 max-w-xs"
        />
        <span className="text-xs text-muted-foreground">
          {saveStatus === "saving"
            ? "Saving…"
            : saveStatus === "saved"
              ? "Saved"
              : ""}
        </span>
        <div className="ml-auto flex rounded-md border border-border shadow-sm overflow-hidden">
          {(
            [
              { m: "build", label: "Build", Icon: PenLine, enabled: true },
              { m: "preview", label: "Preview", Icon: Eye, enabled: true },
              { m: "data", label: "Data", Icon: Database, enabled: true },
            ] as const
          ).map(({ m, label, Icon, enabled }, i) => (
            <div key={m} className="flex items-stretch">
              {i > 0 && <div className="w-px bg-border" />}
              <button
                onClick={() => enabled && handleModeChange(m)}
                disabled={!enabled}
                title={!enabled ? label : undefined}
                className={`flex items-center gap-1.5 px-3 h-8 text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : !enabled
                      ? "text-muted-foreground/40 cursor-not-allowed"
                      : "text-muted-foreground hover:text-foreground hover:bg-zinc-50"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            </div>
          ))}
        </div>
      </header>

      {/* Canvas + right panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <main
          className={`flex-1 relative ${mode === "preview" ? "overflow-hidden flex flex-col" : "overflow-y-auto"}`}
        >
          {mode === "preview" ? (
            <PreviewPane blocks={blocks} stylesheet={stylesheet} />
          ) : mode === "data" ? (
            <DataPane templateId={id!} />
          ) : (
            <div className="px-8 pt-6 pb-8">
              <div className="max-w-2xl mx-auto">
                <BlockCanvas
                  key={canvasKey}
                  blocks={blocks}
                  onChange={handleBlocksChange}
                  editorRef={editorRef}
                  stylesheet={stylesheet}
                  templateId={id!}
                  onSwitchToData={() => handleModeChange("data")}
                />
              </div>
            </div>
          )}
        </main>

        <RightPanel
          templateId={id!}
          stylesheet={stylesheet}
          blocks={blocks}
          editorRef={editorRef}
          onStylesheetChange={setStylesheet}
          onCreateCheckpoint={(label) => createVersion(id!, label)}
          onRestore={handleRestore}
          collapsed={panelCollapsed}
          onCollapsedChange={handlePanelCollapsedChange}
        />
      </div>
    </div>
  );
}
