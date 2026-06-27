import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getJobDetail,
  submitJob,
  submitJobItem,
  downloadItemUrl,
  downloadJobUrl,
  type Job,
  type JobItem,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, ArrowLeft } from "lucide-react";

function StatusBadge({ status }: { status: Job["status"] }) {
  const cfg = {
    draft: { label: "Draft", cls: "text-muted-foreground bg-muted" },
    pending: { label: "Pending", cls: "text-muted-foreground bg-muted" },
    processing: { label: "Processing", cls: "text-primary bg-primary/10" },
    done: { label: "Done", cls: "text-emerald-700 bg-emerald-50" },
    partial: { label: "Partial", cls: "text-amber-700 bg-amber-50" },
    failed: { label: "Failed", cls: "text-destructive bg-destructive/10" },
  }[status];
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function ItemStatusDot({ status }: { status: JobItem["status"] }) {
  const classes = {
    loaded: "bg-muted-foreground/30 border border-border",
    queued: "bg-muted-foreground/30 border border-border animate-pulse",
    processing: "bg-primary/60 border border-primary animate-pulse",
    done: "bg-emerald-500",
    failed: "bg-destructive",
  }[status];
  return (
    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${classes}`} />
  );
}

export default function JobDetailPage() {
  const { id: templateId, jobId } = useParams<{
    id: string;
    jobId: string;
  }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJobDetail(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return false;
      const hasInFlight = d.items.some(
        (i) => i.status === "queued" || i.status === "processing",
      );
      return hasInFlight ? 2000 : false;
    },
  });

  const submitMut = useMutation({
    mutationFn: () => submitJob(jobId!),
    onMutate: () => setGenerating(true),
    onSettled: () => {
      setGenerating(false);
      qc.invalidateQueries({ queryKey: ["job", jobId] });
    },
  });

  const submitItemMut = useMutation({
    mutationFn: (itemId: string) => submitJobItem(jobId!, itemId),
    onSettled: () => qc.invalidateQueries({ queryKey: ["job", jobId] }),
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Job not found.</p>
      </div>
    );
  }

  const items = detail.items;
  const hasLoaded = items.some((i) => i.status === "loaded");
  const hasInFlight = items.some(
    (i) => i.status === "queued" || i.status === "processing",
  );

  const submittedAt = new Date(detail.created_at).toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-border bg-white px-6 py-3 flex items-center gap-4 shrink-0">
        <button
          onClick={() => navigate(`/app/templates/${templateId}/jobs`)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to jobs
        </button>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {detail.name}
          </span>
          <StatusBadge status={detail.status} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {detail.done_count > 0 && (
            <a
              href={downloadJobUrl(detail.id)}
              download
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download all
            </a>
          )}
          {(hasLoaded || hasInFlight) && (
            <Button
              size="sm"
              disabled={!hasLoaded || generating || hasInFlight}
              onClick={() => submitMut.mutate()}
            >
              {generating || hasInFlight ? (
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
      </header>

      {/* Meta strip */}
      <div className="px-6 py-2.5 border-b border-border bg-muted/30 flex items-center gap-6 text-xs text-muted-foreground shrink-0">
        <span>Submitted {submittedAt}</span>
        <span>{detail.total_count} records</span>
        {detail.done_count > 0 && <span>{detail.done_count} done</span>}
        {detail.failed_count > 0 && (
          <span className="text-destructive">{detail.failed_count} failed</span>
        )}
      </div>

      {/* Records table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-white border-b border-border">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground w-8">
                #
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Record
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-28">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground w-32">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const label = item.record_id ?? `Record ${item.record_index + 1}`;
              return (
                <tr
                  key={item.id}
                  className="border-b border-border hover:bg-accent/40 transition-colors"
                >
                  <td className="px-6 py-3 text-xs text-muted-foreground tabular-nums">
                    {item.record_index + 1}
                  </td>
                  <td className="px-4 py-3 text-foreground truncate max-w-xs">
                    {label}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ItemStatusDot status={item.status} />
                      <span className="text-xs text-muted-foreground capitalize">
                        {item.status === "processing" ||
                        item.status === "queued"
                          ? "Generating…"
                          : item.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {item.status === "loaded" && (
                        <button
                          onClick={() => submitItemMut.mutate(item.id)}
                          className="text-xs text-primary hover:underline font-medium"
                        >
                          Generate
                        </button>
                      )}
                      {item.status === "done" && (
                        <a
                          href={downloadItemUrl(detail.id, item.id)}
                          download
                          className="text-xs text-primary hover:underline font-medium"
                        >
                          Download
                        </a>
                      )}
                      {item.status === "failed" && item.error_message && (
                        <span
                          className="text-xs text-destructive truncate max-w-48"
                          title={item.error_message}
                        >
                          {item.error_message}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
