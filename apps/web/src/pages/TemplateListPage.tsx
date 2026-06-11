import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listTemplates, deleteTemplate } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PageContainer } from "@/components/AppLayout";

export default function TemplateListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: listTemplates,
  });

  const deleteMut = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });

  return (
    <PageContainer>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your document templates</p>
          </div>
          <Button onClick={() => navigate("/app/templates/new")}>
            New template
          </Button>
        </div>

        {isLoading ? (
          <p className="text-base text-muted-foreground">Loading…</p>
        ) : templates.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-lg">
            <p className="text-muted-foreground text-base mb-4">No templates yet</p>
            <Button variant="outline" onClick={() => navigate("/app/templates/new")}>
              Create your first template
            </Button>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            {templates.map((t, i) => (
              <div key={t.id}>
                {i > 0 && <Separator />}
                <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                  <button
                    onClick={() => navigate(`/app/templates/${t.id}`)}
                    className="flex-1 text-left"
                  >
                    <span className="text-base font-medium">{t.name}</span>
                    <span className="text-xs text-muted-foreground ml-3">
                      Updated {new Date(t.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete "${t.name}"?`)) deleteMut.mutate(t.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
    </PageContainer>
  );
}
