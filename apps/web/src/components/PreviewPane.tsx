import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { renderPreviewSvg, renderPreviewWithDataSvg } from "@/lib/wasmPreview";
import type { PtTopLevel, StylesheetDef, JobDetail } from "@/lib/api";
import {
  listTemplateJobs,
  getJobDetail,
  submitJob,
  submitJobItem,
} from "@/lib/api";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  blocks: PtTopLevel[];
  stylesheet: StylesheetDef;
  templateId?: string;
}

type RenderState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; pages: string[] }
  | { status: "error"; message: string };

type ViewMode = "fields" | "data";

export default function PreviewPane({ blocks, stylesheet, templateId }: Props) {
  const qc = useQueryClient();
  const [renderState, setRenderState] = useState<RenderState>({
    status: "idle",
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("data");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch all jobs to find the active one
  const { data: jobs } = useQuery({
    queryKey: ["jobs", templateId],
    queryFn: () => listTemplateJobs(templateId!),
    enabled: !!templateId,
  });

  const activeJob = jobs?.find((j) => j.is_active);

  const { data: jobDetail } = useQuery<JobDetail>({
    queryKey: ["job", activeJob?.id],
    queryFn: () => getJobDetail(activeJob!.id),
    enabled: !!activeJob,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return false;
      const hasInFlight = d.items.some(
        (i) => i.status === "queued" || i.status === "processing",
      );
      return hasInFlight ? 2000 : false;
    },
  });

  const items = jobDetail?.items ?? [];
  const currentItem = items[selectedIndex] ?? null;
  const totalItems = items.length;

  const submitItemMut = useMutation({
    mutationFn: () => submitJobItem(activeJob!.id, currentItem!.id),
    onSettled: () => qc.invalidateQueries({ queryKey: ["job", activeJob?.id] }),
  });

  const submitAllMut = useMutation({
    mutationFn: () => submitJob(activeJob!.id),
    onSettled: () => qc.invalidateQueries({ queryKey: ["job", activeJob?.id] }),
  });

  const allSubmitted =
    items.length > 0 &&
    items.every(
      (i) =>
        i.status === "done" ||
        i.status === "queued" ||
        i.status === "processing" ||
        i.status === "failed",
    );

  async function runRender() {
    setRenderState({ status: "loading" });
    try {
      const payload = currentItem?.payload ?? null;
      const pages =
        payload != null
          ? await renderPreviewWithDataSvg(blocks, stylesheet, payload)
          : await renderPreviewSvg(blocks, stylesheet);
      setRenderState({ status: "ready", pages });
    } catch (err) {
      setRenderState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(runRender, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, stylesheet, currentItem]);

  function handlePrev() {
    if (selectedIndex > 0) setSelectedIndex((i) => i - 1);
  }
  function handleNext() {
    if (selectedIndex < totalItems - 1) setSelectedIndex((i) => i + 1);
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-card shrink-0 flex-wrap">
        {/* Fields / Data toggle */}
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          {(["data", "fields"] as const).map((m, i) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-2.5 h-7 font-medium transition-colors ${
                viewMode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              } ${i > 0 ? "border-l border-border" : ""}`}
            >
              {m === "fields" ? "Fields" : "Data"}
            </button>
          ))}
        </div>

        {/* Record navigator */}
        {totalItems > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <button
              onClick={handlePrev}
              disabled={selectedIndex === 0}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="min-w-20 text-center">
              Record {selectedIndex + 1} of {totalItems}
            </span>
            <button
              onClick={handleNext}
              disabled={selectedIndex === totalItems - 1}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Generate CTAs */}
        {activeJob && (
          <div className="ml-auto flex items-center gap-2">
            {currentItem && currentItem.status === "loaded" && (
              <Button
                size="sm"
                variant="outline"
                disabled={submitItemMut.isPending}
                onClick={() => submitItemMut.mutate()}
              >
                {submitItemMut.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Generating…
                  </>
                ) : (
                  "Generate this record"
                )}
              </Button>
            )}
            {!allSubmitted && (
              <Button
                size="sm"
                disabled={submitAllMut.isPending || allSubmitted}
                onClick={() => submitAllMut.mutate()}
              >
                {submitAllMut.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Generating…
                  </>
                ) : (
                  "Generate all"
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* SVG area */}
      <div className="flex-1 overflow-y-auto relative">
        {renderState.status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <p className="text-sm text-muted-foreground bg-card/90 px-3 py-1.5 rounded shadow-sm">
              Rendering…
            </p>
          </div>
        )}

        {renderState.status === "error" && (
          <div className="flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <p className="text-sm font-medium text-destructive mb-1">
                Preview failed
              </p>
              <p className="text-xs text-muted-foreground font-mono break-all">
                {renderState.message}
              </p>
            </div>
          </div>
        )}

        {renderState.status === "ready" && (
          <div className="flex flex-col items-center gap-6 py-8 px-4">
            {renderState.pages.map((svg, i) => (
              <div
                key={i}
                className="shadow-md rounded bg-white w-full max-w-2xl overflow-hidden [&>svg]:w-full [&>svg]:h-auto"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{
                  __html: svg,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
