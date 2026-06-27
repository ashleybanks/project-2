// Base fetch with credentials (session cookie)
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    cache: "no-store",
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

export type StyleKey =
  | "normal"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "tableHeader"
  | "tableData";

export interface ParagraphStyle {
  fontSize?: number;
  spacingBefore?: number;
  spacingAfter?: number;
}

export interface TextStyle extends ParagraphStyle {
  indentSize?: number;
}

export interface TableCellStyle extends ParagraphStyle {
  lineWidth?: number;
  lineColour?: string;
}

export interface StylesheetDef {
  headingFont?: string;
  bodyFont?: string;
  headingColour?: string;
  bodyColour?: string;
  normal?: TextStyle;
  h1?: ParagraphStyle;
  h2?: ParagraphStyle;
  h3?: ParagraphStyle;
  h4?: ParagraphStyle;
  h5?: ParagraphStyle;
  h6?: ParagraphStyle;
  tableHeader?: TableCellStyle;
  tableData?: TableCellStyle;
}

export interface VersionSummary {
  id: string;
  label: string | null;
  created_at: string;
}

export interface TemplateDetail extends TemplateSummary {
  block_model: BlockModel;
  stylesheet: StylesheetDef;
}

export interface BlockModel {
  blocks: PtTopLevel[];
}

// Top-level block model entries — either a plain PT block, section, or table
export type PtTopLevel = PtBlock | PtSection | PtTable;

export interface PtBlock {
  _type: "block";
  _key: string;
  style: string;
  children: PtChild[];
  textAlign?: "left" | "right" | "center" | "justify";
  listItem?: "bullet" | "number";
  level?: number;
}

export interface PtSection {
  _type: "section";
  _key: string;
  conditionIntent?: string;
  repeatIntent?: string;
  content: Array<PtBlock | PtTable>;
  display_name?: string;
  collection_path?: string;
}

export interface PtTable {
  _type: "table";
  _key: string;
  rows: PtTableRow[];
}

export interface PtTableRow {
  _type: "tableRow";
  _key: string;
  cells: PtTableCell[];
}

export interface PtTableCell {
  _type: "tableCell";
  _key: string;
  isHeader: boolean;
  content: PtBlock[];
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
  display_name?: string;
  field_path?: string;
  expression?: string;
  expression_label?: string;
}

// ── Schema types ──────────────────────────────────────────────────────────────

export type MappingConfidence = "high" | "medium" | "low" | "unresolved";
export type IntentType = "field" | "repeat" | "condition";

export interface IntentMapping {
  id: string;
  schema_id: string;
  intent_key: string;
  intent_label: string;
  intent_type: IntentType;
  display_name: string;
  field_path: string | null;
  confidence: MappingConfidence;
  alternatives: string[];
  parent_key: string | null;
}

export interface TemplateSchema {
  id: string;
  template_id: string;
  created_at: string;
  raw_schema: Record<string, unknown>;
  mappings: IntentMapping[];
  resolving: boolean;
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export interface SignUpResponse {
  message: string;
  email_sent: boolean;
}

export interface SignInResponse {
  id: string;
  email: string;
  name: string | null;
}

export interface MfaRequiredResponse {
  mfa_required: true;
  mfa_token: string;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  name?: string,
): Promise<SignUpResponse> {
  const res = await fetch("/api/auth/sign-up/email", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw Object.assign(new Error(body.error ?? res.statusText), {
      code: body.error,
    });
  return body as SignUpResponse;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<SignInResponse | MfaRequiredResponse> {
  const res = await fetch("/api/auth/sign-in/email", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw Object.assign(
      new Error(body.message ?? body.error ?? res.statusText),
      { code: body.error },
    );
  return body as SignInResponse | MfaRequiredResponse;
}

export async function submitMfaChallenge(
  mfa_token: string,
  code: string,
): Promise<void> {
  const res = await fetch("/api/auth/mfa/challenge", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mfa_token, code }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? res.statusText);
  }
}

export async function resendVerificationEmail(email: string): Promise<void> {
  await fetch("/api/auth/resend-verification", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await fetch("/api/auth/forgot-password", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  token: string,
  password: string,
): Promise<void> {
  const res = await fetch("/api/auth/reset-password", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? res.statusText);
  }
}

// ── API functions ──────────────────────────────────────────────────────────────

export const listTemplates = () => apiFetch<TemplateSummary[]>("/templates");

export const createTemplate = (name: string, block_model?: BlockModel) =>
  apiFetch<TemplateDetail>("/templates", {
    method: "POST",
    body: JSON.stringify({ name, block_model: block_model ?? { blocks: [] } }),
  });

export const getTemplate = (id: string) =>
  apiFetch<TemplateDetail>(`/templates/${id}`);

export const updateTemplate = (
  id: string,
  data: { name?: string; block_model?: BlockModel; stylesheet?: StylesheetDef },
) =>
  apiFetch<TemplateDetail>(`/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const deleteTemplate = (id: string) =>
  apiFetch<void>(`/templates/${id}`, { method: "DELETE" });

export const getBrandRules = () =>
  apiFetch<StylesheetDef>("/stylesheets/brand-rules");

export const updateBrandRules = (rules: StylesheetDef) =>
  apiFetch<StylesheetDef>("/stylesheets/brand-rules", {
    method: "PUT",
    body: JSON.stringify(rules),
  });

export const listVersions = (id: string) =>
  apiFetch<VersionSummary[]>(`/templates/${id}/versions`);

export const createVersion = (id: string, label: string) =>
  apiFetch<VersionSummary>(`/templates/${id}/versions`, {
    method: "POST",
    body: JSON.stringify({ label }),
  });

export const restoreVersion = (id: string, versionId: string) =>
  apiFetch<TemplateDetail>(`/templates/${id}/versions/${versionId}/restore`, {
    method: "POST",
  });

// ── Schema API ────────────────────────────────────────────────────────────────

export const getSchema = (templateId: string) =>
  apiFetch<TemplateSchema>(`/templates/${templateId}/schema`);

export const uploadSchema = (
  templateId: string,
  schema: Record<string, unknown>,
) =>
  apiFetch<TemplateSchema>(`/templates/${templateId}/schema`, {
    method: "POST",
    body: JSON.stringify(schema),
  });

export const deleteSchema = (templateId: string) =>
  apiFetch<void>(`/templates/${templateId}/schema`, { method: "DELETE" });

export const triggerResolve = (templateId: string, intentKey?: string) =>
  apiFetch<void>(`/templates/${templateId}/schema/resolve`, {
    method: "POST",
    body: JSON.stringify(intentKey ? { intent_key: intentKey } : {}),
  });

export const patchMapping = (
  templateId: string,
  intentKey: string,
  data: { field_path?: string; display_name?: string },
) =>
  apiFetch<IntentMapping>(
    `/templates/${templateId}/schema/mappings/${encodeURIComponent(intentKey)}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
  );

export interface ResolveExpressionResult {
  expression: string;
  expression_label: string;
}

export const resolveExpression = (
  templateId: string,
  body: { field_path: string; field_type: string; description: string },
) =>
  apiFetch<ResolveExpressionResult>(
    `/templates/${templateId}/intents/resolve-expression`,
    { method: "POST", body: JSON.stringify(body) },
  );

export const generateTestData = (templateId: string, count = 10) =>
  apiFetch<Record<string, unknown>[]>(
    `/templates/${templateId}/schema/test-data?count=${count}`,
    {
      method: "POST",
    },
  );

// ── Jobs / generate ───────────────────────────────────────────────────────────

// ── Job model ─────────────────────────────────────────────────────────────────

export type JobItemStatus =
  "loaded" | "queued" | "processing" | "done" | "failed";
export type JobContainerStatus =
  | "draft"
  | "pending"
  | "processing"
  | "done"
  | "partial"
  | "failed"
  | "cancelled";

export interface JobItem {
  id: string;
  job_id: string;
  record_index: number;
  record_id: string | null;
  status: JobItemStatus;
  error_message: string | null;
  payload: Record<string, unknown>;
}

export interface Job {
  id: string;
  template_id: string;
  name: string;
  status: JobContainerStatus;
  is_active: boolean;
  archived: boolean;
  total_count: number;
  done_count: number;
  failed_count: number;
  created_at: string;
  completed_at: string | null;
}

export interface JobDetail extends Job {
  items: JobItem[];
}

export interface ValidationError {
  field: string;
  message: string;
}

// ── Job API ───────────────────────────────────────────────────────────────────

export const listTemplateJobs = (templateId: string) =>
  apiFetch<Job[]>(`/templates/${templateId}/jobs`);

export const createJob = (
  templateId: string,
  records: Record<string, unknown>[],
) =>
  apiFetch<{ job_id: string; item_count: number }>(
    `/templates/${templateId}/jobs`,
    {
      method: "POST",
      body: JSON.stringify({ records }),
    },
  );

export const getJobDetail = (jobId: string) =>
  apiFetch<JobDetail>(`/jobs/${jobId}`);

export const submitJob = (jobId: string) =>
  apiFetch<{ queued: number }>(`/jobs/${jobId}/submit`, { method: "POST" });

export const submitJobItem = (jobId: string, itemId: string) =>
  apiFetch<void>(`/jobs/${jobId}/items/${itemId}/submit`, { method: "POST" });

export const downloadItemUrl = (jobId: string, itemId: string) =>
  `/api/jobs/${jobId}/items/${itemId}/download`;

export const downloadJobUrl = (jobId: string) => `/api/jobs/${jobId}/download`;

export const setActiveJob = (jobId: string) =>
  apiFetch<{ job_id: string }>(`/jobs/${jobId}/active`, { method: "PATCH" });

export const archiveJob = (jobId: string) =>
  apiFetch<void>(`/jobs/${jobId}/archive`, { method: "POST" });

export const unarchiveJob = (jobId: string) =>
  apiFetch<void>(`/jobs/${jobId}/unarchive`, { method: "POST" });

export const cancelJob = (jobId: string) =>
  apiFetch<void>(`/jobs/${jobId}/cancel`, { method: "POST" });

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
