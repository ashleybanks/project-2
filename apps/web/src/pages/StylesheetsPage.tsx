import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBrandRules, updateBrandRules } from "../lib/api";
import type { StylesheetDef } from "../lib/api";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import StylesheetEditor from "@/components/StylesheetEditor";
import { PageContainer } from "@/components/AppLayout";

export default function StylesheetsPage() {
  const qc = useQueryClient();

  const { data: brandRules, isLoading } = useQuery({
    queryKey: ["brand-rules"],
    queryFn: getBrandRules,
  });

  const [form, setForm] = useState<StylesheetDef>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (brandRules) setForm(brandRules);
  }, [brandRules]);

  const saveMut = useMutation({
    mutationFn: updateBrandRules,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-rules"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Brand rules</h1>
        <span className="text-xs text-muted-foreground">
          {saved ? "Saved" : ""}
        </span>
      </div>
      <p className="text-sm mb-8">
        Brand rules are your workspace defaults. New templates start with a complete copy of
        these settings. Changes here don't affect templates you've already created.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <StylesheetEditor
            value={form}
            onChange={setForm}
            storageKey="brand-rules"
          />
          <div className="pt-4">
            <Button
              onClick={() => saveMut.mutate(form)}
              disabled={saveMut.isPending}
            >
              {saveMut.isPending ? "Saving…" : "Save brand rules"}
            </Button>
          </div>
        </>
      )}
    </PageContainer>
  );
}
