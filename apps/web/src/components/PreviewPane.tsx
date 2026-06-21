import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  renderPreviewSvg,
  renderPreviewWithDataSvgPositions,
  collectFieldIntents,
  parseSvgPageSize,
  getByPath,
} from "@/lib/wasmPreview";
import type { FieldIntentPosition } from "@/lib/wasmPreview";
import type {
  PtFieldIntent,
  PtTopLevel,
  StylesheetDef,
  JobDetail,
} from "@/lib/api";
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
  | { status: "ready"; pages: string[]; positions: FieldIntentPosition[] }
  | { status: "error"; message: string };

type ViewMode = "fields" | "data";

export default function PreviewPane({ blocks, stylesheet, templateId }: Props) {
  const qc = useQueryClient();
  const [renderState, setRenderState] = useState<RenderState>({
    status: "idle",
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("data");
  const [activeChipKey, setActiveChipKey] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fieldIntents = useMemo(() => collectFieldIntents(blocks), [blocks]);

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
      if (payload != null) {
        const { pages, positions } = await renderPreviewWithDataSvgPositions(
          blocks,
          stylesheet,
          payload,
        );
        setRenderState({ status: "ready", pages, positions });
      } else {
        const pages = await renderPreviewSvg(blocks, stylesheet);
        setRenderState({ status: "ready", pages, positions: [] });
      }
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
    if (selectedIndex > 0) {
      setSelectedIndex((i) => i - 1);
      setActiveChipKey(null);
    }
  }
  function handleNext() {
    if (selectedIndex < totalItems - 1) {
      setSelectedIndex((i) => i + 1);
      setActiveChipKey(null);
    }
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
              onClick={() => {
                setViewMode(m);
                setActiveChipKey(null);
              }}
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
            {renderState.pages.map((svg, i) => {
              const pageSize = parseSvgPageSize(svg);
              const pagePositions = renderState.positions.filter(
                (p) => p.page === i + 1,
              );
              return (
                <div
                  key={i}
                  className="relative shadow-md rounded bg-white w-full max-w-2xl overflow-hidden"
                  style={
                    pageSize
                      ? {
                          aspectRatio: `${pageSize.widthPt} / ${pageSize.heightPt}`,
                        }
                      : undefined
                  }
                >
                  <div
                    className="absolute inset-0 z-0 [&>svg]:w-full [&>svg]:h-full"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />

                  {viewMode === "fields" &&
                    pageSize &&
                    pagePositions.map((pos) => {
                      const idx = Number(pos.key.split("-")[1]);
                      const intent = fieldIntents[idx];
                      if (!intent) return null;
                      // The rendered text itself is already coloured indigo
                      // (see compiler.rs) — this box is just the click
                      // target, so keep it subtle rather than redrawing a
                      // second strong highlight on top.
                      const leftPct = (pos.x_pt / pageSize.widthPt) * 100;
                      const topPct = (pos.y_pt / pageSize.heightPt) * 100;
                      const widthPct = (pos.w_pt / pageSize.widthPt) * 100;
                      const heightPct = (pos.h_pt / pageSize.heightPt) * 100;
                      const isActive = activeChipKey === pos.key;
                      return (
                        <div
                          key={pos.key}
                          className="absolute z-10"
                          style={{
                            left: `${leftPct}%`,
                            top: `${topPct}%`,
                            width: `${widthPct}%`,
                            height: `${heightPct}%`,
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveChipKey(isActive ? null : pos.key);
                            }}
                            className={`absolute -inset-1 rounded-sm border transition-colors ${
                              isActive
                                ? "bg-primary/15 border-primary"
                                : "bg-primary/5 border-primary/30 hover:bg-primary/10 hover:border-primary"
                            }`}
                            title={intent.display_name || intent.label}
                          />

                          {intent.expression && (
                            <span
                              className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[8px] font-semibold leading-none text-primary-foreground"
                              title="Format applied in generated PDF"
                            >
                              ƒ
                            </span>
                          )}

                          {isActive && (
                            <FieldIntentChipPopover
                              intent={intent}
                              onClose={() => setActiveChipKey(null)}
                            />
                          )}
                        </div>
                      );
                    })}

                  {viewMode === "data" &&
                    pageSize &&
                    pagePositions.map((pos) => {
                      const idx = Number(pos.key.split("-")[1]);
                      const intent = fieldIntents[idx];
                      if (!intent || !intent.expression || !intent.field_path)
                        return null;
                      const rawValue = currentItem?.payload
                        ? getByPath(currentItem.payload, intent.field_path)
                        : undefined;
                      const leftPct = (pos.x_pt / pageSize.widthPt) * 100;
                      const topPct = (pos.y_pt / pageSize.heightPt) * 100;
                      const widthPct = (pos.w_pt / pageSize.widthPt) * 100;
                      return (
                        <div
                          key={pos.key}
                          className="absolute z-10"
                          style={{
                            left: `${leftPct}%`,
                            top: `${topPct}%`,
                            width: `${widthPct}%`,
                          }}
                        >
                          <span
                            className="absolute -top-1.5 -right-1.5 flex h-3 w-3 cursor-help items-center justify-center rounded-full bg-primary text-[8px] font-semibold leading-none text-primary-foreground"
                            title={`Raw value: ${rawValue == null ? "—" : String(rawValue)} — Format applied in generated PDF`}
                          >
                            ƒ
                          </span>
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Field intent chip popover ────────────────────────────────────────────────
// Read-only summary for a chip in the Preview tab's Fields-mode overlay.
// Editing an intent happens in the Design tab's BlockCanvas; this just shows
// what's behind the chip for the currently-selected record.

function FieldIntentChipPopover({
  intent,
  onClose,
}: {
  intent: PtFieldIntent;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute left-1/2 top-full z-50 mt-2 w-56 -translate-x-1/2 rounded-lg border border-border bg-white p-2.5 text-xs shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-medium text-foreground">
          {intent.display_name || intent.label}
        </p>
        {intent.field_path && (
          <p className="mt-1 font-mono text-muted-foreground break-all">
            {intent.field_path}
          </p>
        )}
        {intent.expression && (
          <div className="mt-1.5 border-t border-border pt-1.5">
            <span className="font-mono text-primary break-all">
              {intent.expression_label ?? intent.expression}
            </span>
            <p className="mt-0.5 text-muted-foreground">
              Format applied in generated PDF
            </p>
          </div>
        )}
      </div>
    </>
  );
}
