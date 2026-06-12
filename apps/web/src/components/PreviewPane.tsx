import { useState, useEffect, useRef } from "react";
import { RotateCw } from "lucide-react";
import { renderPreview } from "@/lib/wasmPreview";
import type { PtTopLevel, StylesheetDef } from "@/lib/api";

interface Props {
  blocks: PtTopLevel[];
  stylesheet: StylesheetDef;
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

export default function PreviewPane({ blocks, stylesheet }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const prevBlobUrl = useRef<string | null>(null);

  async function runRender() {
    setState({ status: "loading" });
    try {
      const bytes = await renderPreview(blocks, stylesheet);
      const blob = new Blob([bytes.slice()], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      if (prevBlobUrl.current) {
        URL.revokeObjectURL(prevBlobUrl.current);
      }
      prevBlobUrl.current = url;

      setState({ status: "ready", url });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  useEffect(() => {
    runRender();
    return () => {
      if (prevBlobUrl.current) {
        URL.revokeObjectURL(prevBlobUrl.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end px-4 py-2 border-b border-border bg-white shrink-0">
        <button
          onClick={runRender}
          disabled={state.status === "loading"}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
        >
          <RotateCw className={`w-3.5 h-3.5 ${state.status === "loading" ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="flex-1 relative">
        {state.status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Rendering…</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <p className="text-sm font-medium text-destructive mb-1">Preview failed</p>
              <p className="text-xs text-muted-foreground font-mono break-all">{state.message}</p>
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
