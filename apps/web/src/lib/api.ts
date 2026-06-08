// Base fetch with credentials (session cookie)
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TemplateSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateDetail extends TemplateSummary {
  block_model: BlockModel;
}

export interface BlockModel {
  blocks: Block[];
}

export interface Block {
  type: "text" | "divider";
  style_class?: string;
  conditionIntent?: string;
  repeatIntent?: string;
  content?: PtBlock[];
}

export interface PtBlock {
  _type: "block";
  _key: string;
  style: string;
  children: PtChild[];
}

export type PtChild = PtSpan | PtFieldIntent;

export interface PtSpan {
  _type: "span";
  _key: string;
  text: string;
  marks: string[];
}

export interface PtFieldIntent {
  _type: "fieldIntent";
  _key: string;
  label: string;
}

// ── API functions ──────────────────────────────────────────────────────────────

export const listTemplates = () =>
  apiFetch<TemplateSummary[]>("/templates");

export const createTemplate = (name: string, block_model?: BlockModel) =>
  apiFetch<TemplateDetail>("/templates", {
    method: "POST",
    body: JSON.stringify({ name, block_model: block_model ?? { blocks: [] } }),
  });

export const getTemplate = (id: string) =>
  apiFetch<TemplateDetail>(`/templates/${id}`);

export const updateTemplate = (id: string, data: { name?: string; block_model?: BlockModel }) =>
  apiFetch<TemplateDetail>(`/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const deleteTemplate = (id: string) =>
  apiFetch<void>(`/templates/${id}`, { method: "DELETE" });

export const importDocx = async (file: File): Promise<BlockModel> => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/templates/import", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json();
};
