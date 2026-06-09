import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBrandRules, updateBrandRules } from "../lib/api";
import type { BrandRules } from "../lib/api";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function StylesheetsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: rules, isLoading } = useQuery({
    queryKey: ["brand-rules"],
    queryFn: getBrandRules,
  });

  const [form, setForm] = useState<BrandRules>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (rules) setForm(rules);
  }, [rules]);

  const saveMut = useMutation({
    mutationFn: updateBrandRules,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-rules"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  function field(label: string, key: keyof BrandRules, type: "text" | "number" | "color" = "text") {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Input
          type={type}
          value={type === "number"
            ? (form[key] as number | undefined) ?? ""
            : (form[key] as string | undefined) ?? ""}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              [key]: type === "number" ? Number(e.target.value) || undefined : e.target.value || undefined,
            }))
          }
          className="h-8 text-sm"
          placeholder={type === "color" ? "#C2511F" : undefined}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-white px-6 py-3 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <span className="text-sm font-medium">Brand rules</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {saved ? "Saved" : ""}
        </span>
      </header>

      <main className="max-w-md mx-auto px-6 py-10">
        <p className="text-xs text-muted-foreground mb-6">
          Brand rules seed the stylesheet for every new template. Existing templates are unaffected.
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form); }}
          >
            {field("Primary font family", "fontFamily")}
            {field("Base font size (px)", "fontSize", "number")}
            {field("Heading font", "headingFont")}
            {field("Accent colour (hex)", "accentColour", "color")}
            {field("Default paragraph spacing (px)", "paragraphSpacing", "number")}

            <Button type="submit" disabled={saveMut.isPending} className="w-full mt-2">
              {saveMut.isPending ? "Saving…" : "Save brand rules"}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
