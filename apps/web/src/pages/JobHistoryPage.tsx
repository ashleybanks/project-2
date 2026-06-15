import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  listTemplateJobs,
  getTemplate,
  downloadJobUrl,
  type Job,
} from "@/lib/api";
import { Download } from "lucide-react";

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

export default function JobHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: template } = useQuery({
    queryKey: ["template", id],
    queryFn: () => getTemplate(id!),
    enabled: !!id,
  });

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs", id],
    queryFn: () => listTemplateJobs(id!),
    enabled: !!id,
  });

  const sorted = [...(jobs ?? [])].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <header className="border-b border-border bg-white px-6 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate(`/app/templates/${id}`)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {template?.name ?? "Template"}
        </button>
        <span className="text-sm font-medium text-foreground">Job history</span>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs yet.</p>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              {sorted.map((job) => {
                const date = new Date(job.created_at).toLocaleDateString(
                  undefined,
                  { month: "short", day: "numeric", year: "numeric" },
                );
                return (
                  <div
                    key={job.id}
                    className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {job.name}
                        </span>
                        {job.is_active && (
                          <span className="text-xs text-primary font-medium">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {job.total_count} record
                        {job.total_count !== 1 ? "s" : ""} · {date}
                        {job.done_count > 0 && ` · ${job.done_count} generated`}
                      </p>
                    </div>
                    <JobStatusBadge status={job.status} />
                    {job.done_count > 0 && (
                      <a
                        href={downloadJobUrl(job.id)}
                        download
                        className="flex items-center gap-1 text-xs text-primary hover:underline font-medium shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
