import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  generateDocument,
  getJob,
  getJobDownloadUrl,
  generateTestData,
  type ValidationError,
  type GenerateResult,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { X, Download, RefreshCw, CheckCircle, XCircle } from "lucide-react";

interface Props {
  templateId: string;
  open: boolean;
  onClose: () => void;
}

export default function GenerateSheet({ templateId, open, onClose }: Props) {
  const qc = useQueryClient();
  const [payloadText, setPayloadText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    [],
  );
  const [jobId, setJobId] = useState<string | null>(null);

  // Fetch test data to pre-fill from
  const testDataQuery = useQuery({
    queryKey: ["test-data", templateId],
    queryFn: () => generateTestData(templateId, 5),
    retry: false,
    staleTime: 60_000,
    enabled: open,
  });

  // Poll job status
  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "pending" || s === "processing" ? 2000 : false;
    },
  });

  const generateMut = useMutation<
    GenerateResult,
    Error,
    Record<string, unknown>
  >({
    mutationFn: (payload) => generateDocument(templateId, payload),
    onSuccess: (result) => {
      if (!result.ok) {
        setValidationErrors(result.errors);
        return;
      }
      setValidationErrors([]);
      setJobId(result.job_id);
      qc.invalidateQueries({ queryKey: ["job", result.job_id] });
    },
  });

  function handleGenerate() {
    setParseError(null);
    setValidationErrors([]);

    let payload: Record<string, unknown> = {};
    if (payloadText.trim()) {
      try {
        payload = JSON.parse(payloadText);
      } catch {
        setParseError("Invalid JSON — check your payload");
        return;
      }
    }
    generateMut.mutate(payload);
  }

  function fillFromTestData(index: number) {
    const records = testDataQuery.data;
    if (records && records[index]) {
      setPayloadText(JSON.stringify(records[index], null, 2));
      setParseError(null);
    }
  }

  function reset() {
    setJobId(null);
    setPayloadText("");
    setParseError(null);
    setValidationErrors([]);
    generateMut.reset();
  }

  const job = jobQuery.data;
  const isRunning = job?.status === "pending" || job?.status === "processing";
  const isDone = job?.status === "done";
  const isFailed = job?.status === "failed";

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-96 bg-background border-l border-border shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold">Generate document</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Status area — shown after submission */}
          {jobId && job && (
            <div
              className={`rounded-lg border p-3 ${
                isDone
                  ? "border-emerald-200 bg-emerald-50"
                  : isFailed
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-border bg-muted/40"
              }`}
            >
              {isRunning && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {job.status === "pending" ? "Queued…" : "Rendering…"}
                </div>
              )}
              {isDone && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-emerald-700">
                    <CheckCircle className="w-4 h-4" />
                    Document ready
                  </div>
                  <a
                    href={getJobDownloadUrl(jobId)}
                    download="document.pdf"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PDF
                  </a>
                </div>
              )}
              {isFailed && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <XCircle className="w-4 h-4" />
                    Generation failed
                  </div>
                  {job.error_message && (
                    <p className="text-xs text-muted-foreground font-mono">
                      {job.error_message}
                    </p>
                  )}
                </div>
              )}
              <button
                onClick={reset}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
              >
                Start over
              </button>
            </div>
          )}

          {/* Payload input — hidden while a job is in flight or done */}
          {!jobId && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium">Payload (JSON)</label>
                  {testDataQuery.data && testDataQuery.data.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">
                        Fill from:
                      </span>
                      {testDataQuery.data.slice(0, 3).map((_, i) => (
                        <button
                          key={i}
                          onClick={() => fillFromTestData(i)}
                          className="text-xs text-primary hover:underline"
                        >
                          Record {i + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <textarea
                  value={payloadText}
                  onChange={(e) => {
                    setPayloadText(e.target.value);
                    setParseError(null);
                  }}
                  placeholder='{\n  "field": "value"\n}'
                  rows={12}
                  className="w-full text-xs font-mono border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
                {parseError && (
                  <p className="text-xs text-destructive mt-1">{parseError}</p>
                )}
              </div>

              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs font-medium text-destructive mb-2">
                    Payload validation errors
                  </p>
                  <ul className="space-y-1">
                    {validationErrors.map((e, i) => (
                      <li key={i} className="text-xs">
                        <span className="font-mono text-destructive">
                          {e.field}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          — {e.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                onClick={handleGenerate}
                disabled={generateMut.isPending}
                className="w-full"
              >
                {generateMut.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  "Generate"
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
