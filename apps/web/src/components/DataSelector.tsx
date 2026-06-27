import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { generateTestData } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ChevronDown, Database } from "lucide-react";

type DataMode =
  { type: "none" } | { type: "test"; index: number } | { type: "custom" };

interface Props {
  templateId: string;
  onPayloadChange: (payload: object | null) => void;
}

export default function DataSelector({ templateId, onPayloadChange }: Props) {
  const [mode, setMode] = useState<DataMode>({ type: "none" });
  const [customJson, setCustomJson] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const testDataQuery = useQuery({
    queryKey: ["test-data", templateId],
    queryFn: () => generateTestData(templateId, 5),
    retry: false,
    staleTime: 60_000,
  });

  const records = testDataQuery.data ?? [];

  function selectMode(next: DataMode) {
    setMode(next);
    setOpen(false);
    if (next.type === "none") {
      onPayloadChange(null);
    } else if (next.type === "test") {
      onPayloadChange(records[next.index] ?? null);
    }
    // custom: payload is applied on Apply click
  }

  function applyCustom() {
    try {
      const parsed = JSON.parse(customJson);
      setCustomError(null);
      onPayloadChange(parsed);
    } catch {
      setCustomError("Invalid JSON");
    }
  }

  const label =
    mode.type === "none"
      ? "No data"
      : mode.type === "test"
        ? `Test record ${mode.index + 1}`
        : "Custom JSON";

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1 bg-background"
        >
          <Database className="w-3 h-3" />
          {label}
          <ChevronDown className="w-3 h-3" />
        </button>

        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <div className="absolute left-0 top-full mt-1 z-50 w-48 rounded-md border border-border bg-popover shadow-md py-1">
              <button
                onClick={() => selectMode({ type: "none" })}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent ${mode.type === "none" ? "text-primary font-medium" : ""}`}
              >
                No data
              </button>

              {records.length > 0 && (
                <>
                  <div className="px-3 py-1 text-xs text-muted-foreground border-t border-border mt-1 pt-1.5">
                    Test records
                  </div>
                  {records.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => selectMode({ type: "test", index: i })}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent ${mode.type === "test" && mode.index === i ? "text-primary font-medium" : ""}`}
                    >
                      Test record {i + 1}
                    </button>
                  ))}
                </>
              )}

              {testDataQuery.isLoading && (
                <p className="px-3 py-1.5 text-xs text-muted-foreground">
                  Loading test data…
                </p>
              )}

              <div className="border-t border-border mt-1 pt-1">
                <button
                  onClick={() => {
                    setMode({ type: "custom" });
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent ${mode.type === "custom" ? "text-primary font-medium" : ""}`}
                >
                  Custom JSON…
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {mode.type === "custom" && (
        <div className="flex items-center gap-1.5">
          <textarea
            value={customJson}
            onChange={(e) => setCustomJson(e.target.value)}
            placeholder='{"key": "value"}'
            rows={1}
            className="text-xs font-mono border border-border rounded px-2 py-1 w-48 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button size="sm" className="h-6 text-xs px-2" onClick={applyCustom}>
            Apply
          </Button>
          {customError && (
            <span className="text-xs text-destructive">{customError}</span>
          )}
        </div>
      )}
    </div>
  );
}
