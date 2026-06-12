import { useState, useEffect, useRef } from "react";
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(runRender, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, stylesheet]);

  return (
    <div className="flex flex-col h-full relative bg-white">
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
  );
}
