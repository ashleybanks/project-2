import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTemplate, updateTemplate, createVersion } from "../lib/api";
import type { PtTopLevel, TemplateDetail, StylesheetDef } from "../lib/api";
import BlockCanvas from "../components/BlockCanvas";
import RightPanel from "../components/RightPanel";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useEditor } from "@tiptap/react";
import { PenLine, Eye, Database } from "lucide-react";

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
  const [templateDetail, setTemplateDetail] = useState<TemplateDetail | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [canvasKey, setCanvasKey] = useState(0);
  const [mode, setMode] = useState<"build" | "preview" | "data">("build");
  const [panelCollapsed, setPanelCollapsed] = useState(() => {
    return localStorage.getItem(`rp-collapsed-${id}`) === "true";
  });

  function handlePanelCollapsedChange(next: boolean) {
    setPanelCollapsed(next);
    localStorage.setItem(`rp-collapsed-${id}`, String(next));
  }
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);

  useEffect(() => {
    if (templateData) {
      setTemplateDetail(templateData);
      setName(templateData.name);
      setBlocks(templateData.block_model.blocks);
      setStylesheet(templateData.stylesheet);
    }
  }, [templateData]);

  const saveMut = useMutation({
    mutationFn: (data: { name?: string; block_model?: { blocks: PtTopLevel[] } }) =>
      updateTemplate(id!, data),
    onSuccess: () => {
      setSaveStatus("saved");
      qc.invalidateQueries({ queryKey: ["templates"] });
      setTimeout(() => setSaveStatus("idle"), 2000);
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

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );

  if (!templateDetail) return (
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
        <Separator orientation="vertical" className="h-4" />
        <Input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="border-none shadow-none text-sm font-medium p-0 h-auto focus-visible:ring-0 max-w-xs"
        />
        <span className="text-xs text-muted-foreground ml-auto">
          {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : ""}
        </span>
      </header>

      {/* Canvas + right panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto px-8 pt-6 pb-8 relative">
          {/* Floating mode toggle — top aligned with the formatting toolbar */}
          {(() => {
            const iconOnly = !panelCollapsed;
            const items = [
              { m: "build",   label: "Build",   Icon: PenLine,  title: undefined },
              { m: "preview", label: "Preview", Icon: Eye,      title: "Available after intents are resolved" },
              { m: "data",    label: "Data",    Icon: Database, title: "Available after data upload" },
            ] as const;
            return (
              <div className="absolute top-6 right-8 z-10 flex rounded-md border border-border bg-white shadow-sm overflow-hidden">
                {items.map(({ m, label, Icon, title }, i) => (
                  <div key={m} className="flex items-stretch">
                    {i > 0 && <div className="w-px bg-border" />}
                    <button
                      onClick={() => m === "build" && setMode(m)}
                      disabled={m !== "build"}
                      title={iconOnly ? label : title}
                      className={`flex items-center gap-1.5 px-3 h-9 text-sm font-medium transition-colors ${
                        mode === m
                          ? "bg-primary text-primary-foreground"
                          : m !== "build"
                          ? "text-muted-foreground/40 cursor-not-allowed"
                          : "text-muted-foreground hover:text-foreground hover:bg-zinc-50"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {!iconOnly && <span>{label}</span>}
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="max-w-2xl mx-auto">
            <BlockCanvas key={canvasKey} blocks={blocks} onChange={handleBlocksChange} editorRef={editorRef} stylesheet={stylesheet} />
          </div>
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
