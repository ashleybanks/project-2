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

export interface BrandRules {
  fontFamily?: string;
  fontSize?: number;
  headingFont?: string;
  accentColour?: string;
  paragraphSpacing?: number;
}

export interface Stylesheet {
  brand_snapshot?: BrandRules;
  overrides?: Partial<BrandRules>;
}

export interface VersionSummary {
  id: string;
  label: string | null;
  created_at: string;
}

export interface TemplateDetail extends TemplateSummary {
  block_model: BlockModel;
  stylesheet: Stylesheet;
}

export interface BlockModel {
  blocks: PtTopLevel[];
}

// Top-level block model entries — either a plain PT block or a PT section type
export type PtTopLevel = PtBlock | PtSection;

export interface PtBlock {
  _type: "block";
  _key: string;
  style: string;
  children: PtChild[];
}

export interface PtSection {
  _type: "section";
  _key: string;
  conditionIntent?: string;
  repeatIntent?: string;
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
  if (!res.ok) throw Object.assign(new Error(body.error ?? res.statusText), { code: body.error });
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
  if (!res.ok) throw Object.assign(new Error(body.message ?? body.error ?? res.statusText), { code: body.error });
  return body as SignInResponse | MfaRequiredResponse;
}

export async function submitMfaChallenge(mfa_token: string, code: string): Promise<void> {
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

export async function resetPassword(token: string, password: string): Promise<void> {
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

export const listTemplates = () =>
  apiFetch<TemplateSummary[]>("/templates");

export const createTemplate = (name: string, block_model?: BlockModel) =>
  apiFetch<TemplateDetail>("/templates", {
    method: "POST",
    body: JSON.stringify({ name, block_model: block_model ?? { blocks: [] } }),
  });

export const getTemplate = (id: string) =>
  apiFetch<TemplateDetail>(`/templates/${id}`);

export const updateTemplate = (id: string, data: { name?: string; block_model?: BlockModel; stylesheet?: Partial<BrandRules> }) =>
  apiFetch<TemplateDetail>(`/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const deleteTemplate = (id: string) =>
  apiFetch<void>(`/templates/${id}`, { method: "DELETE" });

export const getBrandRules = () =>
  apiFetch<BrandRules>("/stylesheets/brand-rules");

export const updateBrandRules = (rules: BrandRules) =>
  apiFetch<BrandRules>("/stylesheets/brand-rules", {
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
