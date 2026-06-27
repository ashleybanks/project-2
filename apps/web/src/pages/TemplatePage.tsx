import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
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
import JobPane from "../components/JobPane";
import { useEditor } from "@tiptap/react";
import { useTemplateNav } from "@/lib/templateNavContext";

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

function tabFromPath(pathname: string): "design-template" | "preview" | "data" {
  if (pathname.endsWith("/jobs")) return "data";
  if (pathname.endsWith("/preview")) return "preview";
  return "design-template";
}

export default function TemplatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
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
  const mode = tabFromPath(location.pathname);
  const [designSubTab, setDesignSubTab] = useState<"template" | "schema">(
    "template",
  );
  const [panelCollapsed, setPanelCollapsed] = useState(() => {
    return localStorage.getItem(`rp-collapsed-${id}`) === "true";
  });
  // Track the panel state before an auto-collapse so we can restore it
  const panelCollapsedBeforeAutoRef = useRef<boolean | null>(null);

  function handlePanelCollapsedChange(next: boolean) {
    setPanelCollapsed(next);
    localStorage.setItem(`rp-collapsed-${id}`, String(next));
  }

  function handleModeChange(next: "design-template" | "preview" | "data") {
    if (next === "preview" && !panelCollapsed) {
      panelCollapsedBeforeAutoRef.current = panelCollapsed;
      handlePanelCollapsedChange(true);
    } else if (
      next === "design-template" &&
      panelCollapsedBeforeAutoRef.current !== null
    ) {
      handlePanelCollapsedChange(panelCollapsedBeforeAutoRef.current);
      panelCollapsedBeforeAutoRef.current = null;
    }
    const suffix =
      next === "data" ? "/jobs" : next === "preview" ? "/preview" : "";
    navigate(`/app/templates/${id}${suffix}`);
  }

  const { setTemplateNav, clearTemplateNav } = useTemplateNav();

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

  useEffect(() => {
    setTemplateNav(name, saveStatus);
  }, [name, saveStatus]);

  useEffect(() => {
    return () => clearTemplateNav();
  }, []);

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

  const topTabs = [
    { tab: "design-template" as const, label: "Design" },
    { tab: "data" as const, label: "Data" },
    { tab: "preview" as const, label: "Preview" },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Template header — tabs only */}
      <header className="border-b border-border bg-white flex items-stretch shrink-0">
        <div className="flex-1" />
        <div className="flex items-stretch">
          {topTabs.map(({ tab, label }) => {
            const active = mode === tab;
            return (
              <button
                key={tab}
                onClick={() => handleModeChange(tab)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
      </header>

      {/* Design sub-tabs: Template | Schema */}
      {mode === "design-template" && (
        <div className="border-b border-border bg-white px-6 flex items-center gap-0 shrink-0">
          {(["template", "schema"] as const).map((sub) => (
            <button
              key={sub}
              onClick={() => setDesignSubTab(sub)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px capitalize transition-colors ${
                designSubTab === sub
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {sub === "template" ? "Template" : "Schema"}
            </button>
          ))}
        </div>
      )}

      {/* Canvas + right panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <main
          className={`flex-1 relative ${mode === "preview" || mode === "data" ? "overflow-hidden flex flex-col" : "overflow-y-auto"}`}
        >
          {mode === "preview" ? (
            <PreviewPane
              blocks={blocks}
              stylesheet={stylesheet}
              templateId={id!}
            />
          ) : mode === "data" ? (
            <JobPane templateId={id!} />
          ) : designSubTab === "schema" ? (
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

        {mode !== "data" && (
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
        )}
      </div>
    </div>
  );
}
