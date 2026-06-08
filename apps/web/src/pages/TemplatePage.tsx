import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTemplate, updateTemplate } from "../lib/api";
import type { Block } from "../lib/api";
import BlockCanvas from "../components/BlockCanvas";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export default function TemplatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: template, isLoading } = useQuery({
    queryKey: ["template", id],
    queryFn: () => getTemplate(id!),
    enabled: !!id,
  });

  const [name, setName] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setBlocks(template.block_model.blocks);
    }
  }, [template]);

  const saveMut = useMutation({
    mutationFn: (data: { name?: string; block_model?: { blocks: Block[] } }) =>
      updateTemplate(id!, data),
    onSuccess: () => {
      setSaveStatus("saved");
      qc.invalidateQueries({ queryKey: ["templates"] });
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
  });

  function scheduleAutoSave(newBlocks: Block[], newName: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus("saving");
    debounceRef.current = setTimeout(() => {
      saveMut.mutate({ name: newName, block_model: { blocks: newBlocks } });
    }, 2000);
  }

  function handleBlocksChange(newBlocks: Block[]) {
    setBlocks(newBlocks);
    scheduleAutoSave(newBlocks, name);
  }

  function handleNameChange(newName: string) {
    setName(newName);
    scheduleAutoSave(blocks, newName);
  }

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );

  if (!template) return (
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

      {/* Canvas */}
      <main className="flex-1 px-6 py-8 max-w-3xl mx-auto w-full">
        <BlockCanvas blocks={blocks} onChange={handleBlocksChange} />
      </main>
    </div>
  );
}
