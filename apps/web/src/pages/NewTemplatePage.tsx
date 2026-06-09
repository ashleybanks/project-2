import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createTemplate, importDocx } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewTemplatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("Untitled template");
  const [status, setStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleBlank() {
    try {
      const t = await createTemplate(name || "Untitled template");
      navigate(`/app/templates/${t.id}`);
    } catch (e: unknown) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setStatus("Parsing document…");
    try {
      const blockModel = await importDocx(file);
      // The block model has a single section entry whose content array holds the PT blocks
      const section = blockModel.blocks[0];
      const paragraphCount = section._type === "section" ? section.content.length : 0;
      setStatus(`Imported ${paragraphCount} paragraph${paragraphCount !== 1 ? "s" : ""} — creating template…`);
      const t = await createTemplate(name || file.name.replace(/\.docx$/i, ""), blockModel);
      navigate(`/app/templates/${t.id}`);
    } catch (e: unknown) {
      setStatus(`Import failed: ${(e as Error).message}`);
      setImporting(false);
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">New template</h1>
          <p className="text-base text-muted-foreground mt-0.5">Start blank or import an existing document</p>
        </div>

        <div className="space-y-2 mb-8">
          <Label htmlFor="name">Template name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-sm"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={handleBlank}>
            <CardHeader>
              <CardTitle className="text-base">Start blank</CardTitle>
              <CardDescription>Build your template block by block on an empty canvas.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">Create blank</Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => fileRef.current?.click()}>
            <CardHeader>
              <CardTitle className="text-base">Import document</CardTitle>
              <CardDescription>Upload a DOCX file and mark it up on the canvas.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" disabled={importing}>
                {importing ? "Importing…" : "Choose DOCX file"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={handleImport}
              />
            </CardContent>
          </Card>
        </div>

        {status && (
          <p className="text-sm text-muted-foreground mt-6">{status}</p>
        )}
      </div>
    </div>
  );
}
