import { useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from "@tanstack/react-table";
import {
  listTemplateJobs,
  createJob,
  downloadJobUrl,
  setActiveJob,
  archiveJob,
  unarchiveJob,
  cancelJob,
  type Job,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Download,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Upload,
  X,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Job["status"] }) {
  const cfg = {
    draft: { label: "Draft", cls: "text-muted-foreground bg-muted" },
    pending: { label: "Pending", cls: "text-muted-foreground bg-muted" },
    processing: { label: "Processing", cls: "text-primary bg-primary/10" },
    done: { label: "Done", cls: "text-emerald-700 bg-emerald-50" },
    partial: { label: "Partial", cls: "text-amber-700 bg-amber-50" },
    failed: { label: "Failed", cls: "text-destructive bg-destructive/10" },
    cancelled: { label: "Cancelled", cls: "text-muted-foreground bg-muted" },
  }[status];
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── New job modal ─────────────────────────────────────────────────────────────

function NewJobModal({
  templateId,
  onClose,
}: {
  templateId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [inputMode, setInputMode] = useState<"upload" | "paste">("upload");
  const [raw, setRaw] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: (records: Record<string, unknown>[]) =>
      createJob(templateId, records),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs", templateId] });
      onClose();
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Failed to create job");
    },
  });

  function parseAndSubmit(text: string, source: string) {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.trim());
    } catch {
      setError(`${source}: invalid JSON.`);
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

  async function handleFile(file: File) {
    if (!file.name.endsWith(".json")) {
      setError("Only JSON files are supported right now.");
      return;
    }
    setFileName(file.name);
    const text = await file.text();
    setRaw(text);
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleFile(file);
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-8 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl flex flex-col rounded-xl border border-border bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <span className="text-sm font-semibold">New job</span>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-accent transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Tab switcher */}
          <div className="flex border-b border-border px-5">
            {(["upload", "paste"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setInputMode(m);
                  setError(null);
                }}
                className={`px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  inputMode === m
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "upload" ? "Upload file" : "Paste JSON"}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            {inputMode === "upload" ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-accent/40"
                }`}
              >
                <Upload className="w-6 h-6 text-muted-foreground" />
                {fileName ? (
                  <p className="text-sm font-medium text-foreground">
                    {fileName}
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-foreground font-medium">
                      Drop a file or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      JSON supported · CSV, XLSX coming soon
                    </p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) await handleFile(file);
                    e.target.value = "";
                  }}
                />
              </div>
            ) : (
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={
                  '[\n  { "name": "Alice", "amount": 9780 },\n  { "name": "Bob", "amount": 5000 }\n]'
                }
                className="w-full min-h-48 text-xs font-mono bg-muted/40 border border-input rounded-md p-3 resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                spellCheck={false}
              />
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                createMut.isPending ||
                (inputMode === "upload" && !raw.trim()) ||
                (inputMode === "paste" && !raw.trim())
              }
              onClick={() =>
                parseAndSubmit(raw, inputMode === "upload" ? "File" : "JSON")
              }
            >
              {createMut.isPending ? "Loading records…" : "Load records"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Pagination controls ───────────────────────────────────────────────────────

function PaginationBar({
  pageIndex,
  pageCount,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  rowCount,
  pageSize,
}: {
  pageIndex: number;
  pageCount: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  rowCount: number;
  pageSize: number;
}) {
  const from = pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, rowCount);
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
      <span>
        {rowCount === 0 ? "No results" : `${from}–${to} of ${rowCount}`}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={onPrevious}
          disabled={!canPrevious}
          className="p-1 rounded hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-2">
          {pageIndex + 1} / {pageCount || 1}
        </span>
        <button
          onClick={onNext}
          disabled={!canNext}
          className="p-1 rounded hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Main JobPane ──────────────────────────────────────────────────────────────

export default function JobPane({ templateId }: { templateId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "created_at", desc: true },
  ]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showArchived, setShowArchived] = useState(false);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs", templateId],
    queryFn: () => listTemplateJobs(templateId),
  });

  const activateMut = useMutation({
    mutationFn: (jobId: string) => setActiveJob(jobId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", templateId] }),
  });

  const archiveMut = useMutation({
    mutationFn: (jobId: string) => archiveJob(jobId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", templateId] }),
  });

  const unarchiveMut = useMutation({
    mutationFn: (jobId: string) => unarchiveJob(jobId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", templateId] }),
  });

  const cancelMut = useMutation({
    mutationFn: (jobId: string) => cancelJob(jobId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", templateId] }),
  });

  const visibleJobs = useMemo(
    () => (showArchived ? jobs : jobs.filter((j) => !j.archived)),
    [jobs, showArchived],
  );

  const columns = useMemo<ColumnDef<Job>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomePageRowsSelected();
            }}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            className="rounded border-border accent-primary cursor-pointer"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-border accent-primary cursor-pointer"
          />
        ),
        size: 40,
        enableSorting: false,
      },
      {
        accessorKey: "created_at",
        header: "Submitted",
        cell: ({ getValue }) => (
          <span className="text-foreground">
            {formatDateTime(getValue() as string)}
          </span>
        ),
        size: 180,
      },
      {
        id: "submitted_by",
        header: "Submitted by",
        cell: () => <span className="text-muted-foreground">—</span>,
        enableSorting: false,
        size: 140,
      },
      {
        id: "source",
        header: "Via",
        cell: () => <span className="text-muted-foreground">—</span>,
        enableSorting: false,
        size: 80,
      },
      {
        accessorKey: "name",
        header: "Description",
        cell: ({ getValue }) => (
          <span className="text-foreground truncate">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
      {
        accessorKey: "total_count",
        header: "Records",
        cell: ({ getValue }) => (
          <span className="text-foreground tabular-nums">
            {(getValue() as number).toLocaleString()}
          </span>
        ),
        size: 90,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => (
          <StatusBadge status={getValue() as Job["status"]} />
        ),
        enableSorting: false,
        size: 110,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        size: 180,
        cell: ({ row }) => {
          const job = row.original;
          const cancellable = ["draft", "pending", "processing"].includes(
            job.status,
          );
          return (
            <div
              className="flex items-center gap-3 justify-end opacity-0 group-hover/row:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() =>
                  activateMut.mutate(job.id, {
                    onSuccess: () =>
                      navigate(`/app/templates/${templateId}/preview`),
                  })
                }
                disabled={activateMut.isPending}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
              >
                Preview
              </button>
              {job.done_count > 0 && (
                <a
                  href={downloadJobUrl(job.id)}
                  download
                  title="Download"
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              )}
              {cancellable && (
                <button
                  onClick={() => cancelMut.mutate(job.id)}
                  disabled={cancelMut.isPending}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
              )}
              {!cancellable && (
                <button
                  onClick={() =>
                    job.archived
                      ? unarchiveMut.mutate(job.id)
                      : archiveMut.mutate(job.id)
                  }
                  disabled={archiveMut.isPending || unarchiveMut.isPending}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                >
                  {job.archived ? "Unarchive" : "Archive"}
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [activateMut, archiveMut, unarchiveMut, cancelMut, navigate, templateId],
  );

  const table = useReactTable({
    data: visibleJobs,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const selectedCount = Object.keys(rowSelection).length;
  const selectedJobs = table.getSelectedRowModel().rows.map((r) => r.original);

  function SortIcon({ colId }: { colId: string }) {
    const col = table.getColumn(colId);
    if (!col?.getCanSort()) return null;
    const sorted = col.getIsSorted();
    if (sorted === "asc") return <ChevronUp className="w-3 h-3 ml-1 inline" />;
    if (sorted === "desc")
      return <ChevronDown className="w-3 h-3 ml-1 inline" />;
    return <ChevronsUpDown className="w-3 h-3 ml-1 inline opacity-40" />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-white shrink-0">
        <div className="flex items-center gap-3">
          {selectedCount > 0 ? (
            <>
              <span className="text-sm text-muted-foreground">
                {selectedCount} selected
              </span>
              {selectedJobs.some((j) => j.done_count > 0) && (
                <button
                  className="flex items-center gap-1.5 text-sm text-foreground hover:text-primary transition-colors"
                  onClick={() => {
                    selectedJobs
                      .filter((j) => j.done_count > 0)
                      .forEach((j) => {
                        const a = document.createElement("a");
                        a.href = downloadJobUrl(j.id);
                        a.download = "";
                        a.click();
                      });
                  }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              )}
              {selectedJobs.some(
                (j) =>
                  !j.archived &&
                  !["draft", "pending", "processing"].includes(j.status),
              ) && (
                <button
                  onClick={() =>
                    selectedJobs
                      .filter(
                        (j) =>
                          !j.archived &&
                          !["draft", "pending", "processing"].includes(
                            j.status,
                          ),
                      )
                      .forEach((j) => archiveMut.mutate(j.id))
                  }
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Archive
                </button>
              )}
              {selectedJobs.some((j) =>
                ["draft", "pending", "processing"].includes(j.status),
              ) && (
                <button
                  onClick={() =>
                    selectedJobs
                      .filter((j) =>
                        ["draft", "pending", "processing"].includes(j.status),
                      )
                      .forEach((j) => cancelMut.mutate(j.id))
                  }
                  className="text-sm text-muted-foreground hover:text-destructive transition-colors"
                >
                  Cancel
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
              <button
                onClick={() => setShowArchived(false)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  !showArchived
                    ? "bg-foreground text-background font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setShowArchived(true)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  showArchived
                    ? "bg-foreground text-background font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
            </div>
          )}
        </div>

        <Button size="sm" onClick={() => setShowModal(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          New job
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {visibleJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <p className="text-sm text-muted-foreground">No jobs yet.</p>
            <Button size="sm" onClick={() => setShowModal(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New job
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-white border-b border-border">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={`px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap select-none ${
                        header.column.getCanSort()
                          ? "cursor-pointer hover:text-foreground"
                          : ""
                      }`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      <SortIcon colId={header.column.id} />
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() =>
                    navigate(
                      `/app/templates/${templateId}/jobs/${row.original.id}`,
                    )
                  }
                  className="group/row border-b border-border cursor-pointer transition-colors hover:bg-accent/50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {visibleJobs.length > 0 && (
        <PaginationBar
          pageIndex={table.getState().pagination.pageIndex}
          pageCount={table.getPageCount()}
          canPrevious={table.getCanPreviousPage()}
          canNext={table.getCanNextPage()}
          onPrevious={() => table.previousPage()}
          onNext={() => table.nextPage()}
          rowCount={table.getFilteredRowModel().rows.length}
          pageSize={table.getState().pagination.pageSize}
        />
      )}

      {showModal && (
        <NewJobModal
          templateId={templateId}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
