import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTemplate, updateTemplate, createVersion } from "../lib/api";
import type { PtTopLevel, TemplateDetail } from "../lib/api";
import BlockCanvas from "../components/BlockCanvas";
import RightPanel from "../components/RightPanel";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useEditor } from "@tiptap/react";

export default function TemplatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: templateData, isLoading } = useQuery({
    queryKey: ["template", id],
    queryFn: () => getTemplate(id!),
    enabled: !!id,
  });

  const [name, setName] = useState("");
  const [blocks, setBlocks] = useState<PtTopLevel[]>([]);
  const [templateDetail, setTemplateDetail] = useState<TemplateDetail | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);

  useEffect(() => {
    if (templateData) {
      setTemplateDetail(templateData);
      setName(templateData.name);
      setBlocks(templateData.block_model.blocks);
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
    setTemplateDetail(restoredTemplate);
    setBlocks(restoredTemplate.block_model.blocks);
    qc.invalidateQueries({ queryKey: ["template", id] });
  }

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );

  if (!templateDetail) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Template not found.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border bg-white px-6 py-3 flex items-center gap-4">
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
          className="border-none shadow-none text-base font-medium p-0 h-auto focus-visible:ring-0 max-w-xs"
        />
        <span className="text-xs text-muted-foreground ml-auto">
          {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : ""}
        </span>
      </header>

      {/* Mode tabs */}
      <div className="border-b border-border bg-white px-6 flex gap-0">
        <button className="px-4 py-2.5 text-sm font-medium text-primary border-b-2 border-primary -mb-px">
          Build
        </button>
        <button className="px-4 py-2.5 text-sm text-muted-foreground cursor-not-allowed" disabled title="Available after intents are resolved">
          Preview
        </button>
        <button className="px-4 py-2.5 text-sm text-muted-foreground cursor-not-allowed" disabled title="Available after data upload">
          Data
        </button>
      </div>

      {/* Build layout: canvas + right panel */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-2xl mx-auto">
            <BlockCanvas blocks={blocks} onChange={handleBlocksChange} editorRef={editorRef} />
          </div>
        </main>

        <RightPanel
          templateId={id!}
          stylesheet={templateDetail.stylesheet}
          editorRef={editorRef}
          onCreateCheckpoint={(label) => createVersion(id!, label)}
          onRestore={handleRestore}
        />
      </div>
    </div>
  );
}
