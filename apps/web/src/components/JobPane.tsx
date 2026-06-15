import { useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listTemplateJobs,
  createJob,
  getJobDetail,
  submitJob,
  submitJobItem,
  downloadItemUrl,
  downloadJobUrl,
  setActiveJob,
  type Job,
  type JobDetail,
  type JobItem,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ── Status indicators ─────────────────────────────────────────────────────────

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

function JobStatusBadge({ status }: { status: Job["status"] }) {
  const { label, cls } = {
    draft: { label: "Draft", cls: "text-muted-foreground bg-muted" },
    pending: { label: "Pending", cls: "text-muted-foreground bg-muted" },
    processing: { label: "Processing", cls: "text-primary bg-primary/10" },
    done: { label: "Done", cls: "text-emerald-700 bg-emerald-50" },
    partial: { label: "Partial", cls: "text-amber-700 bg-amber-50" },
    failed: { label: "Failed", cls: "text-destructive bg-destructive/10" },
  }[status];
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ── Record row ────────────────────────────────────────────────────────────────

function RecordRow({
  item,
  jobId,
  onGenerate,
}: {
  item: JobItem;
  jobId: string;
  onGenerate: (itemId: string) => void;
}) {
  const label = item.record_id ?? `Record ${item.record_index + 1}`;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
      <ItemStatusDot status={item.status} />
      <span className="text-sm flex-1 truncate">{label}</span>
      <span className="text-xs text-muted-foreground w-20 text-right">
        {item.status === "processing" || item.status === "queued"
          ? "Generating…"
          : item.status}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        {item.status === "loaded" && (
          <button
            onClick={() => onGenerate(item.id)}
            className="text-xs text-primary hover:underline font-medium"
          >
            Generate
          </button>
        )}
        {item.status === "done" && (
          <a
            href={downloadItemUrl(jobId, item.id)}
            download
            className="text-xs text-primary hover:underline font-medium"
          >
            Download
          </a>
        )}
        {item.status === "failed" && item.error_message && (
          <span
            className="text-xs text-destructive truncate max-w-32"
            title={item.error_message}
          >
            {item.error_message}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Active job panel ──────────────────────────────────────────────────────────

function ActiveJobPanel({ job, templateId }: { job: Job; templateId: string }) {
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);

  const { data: detail } = useQuery({
    queryKey: ["job", job.id],
    queryFn: () => getJobDetail(job.id),
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
    mutationFn: () => submitJob(job.id),
    onMutate: () => setGenerating(true),
    onSettled: () => {
      setGenerating(false);
      qc.invalidateQueries({ queryKey: ["job", job.id] });
    },
  });

  const submitItemMut = useMutation({
    mutationFn: (itemId: string) => submitJobItem(job.id, itemId),
    onSettled: () => qc.invalidateQueries({ queryKey: ["job", job.id] }),
  });

  const items = detail?.items ?? [];
  const hasLoaded = items.some((i) => i.status === "loaded");
  const hasInFlight = items.some(
    (i) => i.status === "queued" || i.status === "processing",
  );
  const createdDate = new Date(job.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {job.name}
            </span>
            <JobStatusBadge status={job.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {job.total_count} record{job.total_count !== 1 ? "s" : ""} ·{" "}
            {createdDate}
            {job.done_count > 0 && ` · ${job.done_count} done`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {job.done_count > 0 && (
            <a
              href={downloadJobUrl(job.id)}
              download
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
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
      </div>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <RecordRow
            key={item.id}
            item={item}
            jobId={job.id}
            onGenerate={(itemId) => submitItemMut.mutate(itemId)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Previous jobs list ────────────────────────────────────────────────────────

function PreviousJobsSection({
  jobs,
  templateId,
}: {
  jobs: Job[];
  templateId: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const activateMut = useMutation({
    mutationFn: (jobId: string) => setActiveJob(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs", templateId] });
    },
  });

  if (jobs.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        {jobs.length} previous job{jobs.length !== 1 ? "s" : ""}
      </button>
      {open && (
        <div className="mt-2 border border-border rounded-lg overflow-hidden">
          {jobs.map((job) => {
            const createdDate = new Date(job.created_at).toLocaleDateString(
              undefined,
              { month: "short", day: "numeric" },
            );
            return (
              <div
                key={job.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-foreground">{job.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {job.total_count} records · {createdDate}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <JobStatusBadge status={job.status} />
                  {job.done_count > 0 && (
                    <a
                      href={downloadJobUrl(job.id)}
                      download
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Download
                    </a>
                  )}
                  <button
                    onClick={() => activateMut.mutate(job.id)}
                    disabled={activateMut.isPending}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Make active
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── New job form ──────────────────────────────────────────────────────────────

function NewJobForm({
  templateId,
  onCreated,
  onCancel,
}: {
  templateId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: (records: Record<string, unknown>[]) =>
      createJob(templateId, records),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs", templateId] });
      onCreated();
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Failed to create job");
    },
  });

  function handleLoad() {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      setError("Invalid JSON — must be a JSON array of objects.");
      return;
    }
    if (
      !Array.isArray(parsed) ||
      parsed.some((r) => typeof r !== "object" || r === null)
    ) {
      setError("Must be a JSON array of objects.");
      return;
    }
    createMut.mutate(parsed as Record<string, unknown>[]);
  }

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground mb-1">New job</p>
        <p className="text-xs text-muted-foreground">
          Paste a JSON array of records to create a new job.
        </p>
      </div>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={
          '[\n  { "name": "Alice", "amount": 9780 },\n  { "name": "Bob", "amount": 5000 }\n]'
        }
        className="w-full min-h-32 text-xs font-mono bg-muted/40 border border-input rounded p-2 resize-y focus:outline-none focus:ring-1 focus:ring-ring"
        spellCheck={false}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleLoad}
          disabled={!raw.trim() || createMut.isPending}
        >
          {createMut.isPending ? "Loading…" : "Load records"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Main JobPane ──────────────────────────────────────────────────────────────

export default function JobPane({ templateId }: { templateId: string }) {
  const [showNewForm, setShowNewForm] = useState(false);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs", templateId],
    queryFn: () => listTemplateJobs(templateId),
  });

  const activeJob = jobs?.find((j) => j.is_active);
  const previousJobs = jobs?.filter((j) => !j.is_active) ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="px-8 pt-6 pb-8 max-w-2xl mx-auto">
      {showNewForm ? (
        <NewJobForm
          templateId={templateId}
          onCreated={() => setShowNewForm(false)}
          onCancel={() => setShowNewForm(false)}
        />
      ) : !activeJob ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            No active job. Load a set of records to get started.
          </p>
          <Button size="sm" onClick={() => setShowNewForm(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New job
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-foreground">Active job</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowNewForm(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New job
            </Button>
          </div>
          <ActiveJobPanel job={activeJob} templateId={templateId} />
          <PreviousJobsSection jobs={previousJobs} templateId={templateId} />
          <div className="mt-4 text-right">
            <Link
              to={`/app/templates/${templateId}/jobs`}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View full history →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
