import { useState, useEffect, useRef } from "react";
import { renderPreview, renderPreviewWithData } from "@/lib/wasmPreview";
import type { PtTopLevel, StylesheetDef } from "@/lib/api";
import DataSelector from "./DataSelector";
import { Download } from "lucide-react";

interface Props {
  blocks: PtTopLevel[];
  stylesheet: StylesheetDef;
  templateId?: string;
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string; bytes: Uint8Array }
  | { status: "error"; message: string };

export default function PreviewPane({ blocks, stylesheet, templateId }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [payload, setPayload] = useState<object | null>(null);
  const prevBlobUrl = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function runRender() {
    setState({ status: "loading" });
    try {
      const bytes =
        payload != null
          ? await renderPreviewWithData(blocks, stylesheet, payload)
          : await renderPreview(blocks, stylesheet);

      const blob = new Blob([bytes.slice()], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      if (prevBlobUrl.current) {
        URL.revokeObjectURL(prevBlobUrl.current);
      }
      prevBlobUrl.current = url;

      setState({ status: "ready", url, bytes });
    } catch (err) {
      setState({
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
      if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, stylesheet, payload]);

  function downloadPreview() {
    if (state.status !== "ready") return;
    const blob = new Blob([state.bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "preview.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border shrink-0">
        {templateId && (
          <DataSelector templateId={templateId} onPayloadChange={setPayload} />
        )}
        <div className="ml-auto">
          <button
            onClick={downloadPreview}
            disabled={state.status !== "ready"}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3 h-3" />
            Download preview
          </button>
        </div>
      </div>

      {/* PDF area */}
      <div className="relative flex-1">
        {state.status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <p className="text-sm text-muted-foreground bg-white/80 px-3 py-1.5 rounded shadow-sm">
              Rendering…
            </p>
          </div>
        )}

        {state.status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center p-8 z-10">
            <div className="text-center max-w-md">
              <p className="text-sm font-medium text-destructive mb-1">
                Preview failed
              </p>
              <p className="text-xs text-muted-foreground font-mono break-all">
                {state.message}
              </p>
            </div>
          </div>
        )}

        {state.status === "ready" && (
          <iframe
            src={state.url}
            className="w-full h-full border-0"
            title="Template preview"
          />
        )}
      </div>
    </div>
  );
}
