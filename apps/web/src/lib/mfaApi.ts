async function mfaFetch<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(`/api/auth/mfa/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? res.statusText);
  }
  if (res.status === 200 && res.headers.get("content-type")?.includes("application/json")) {
    return res.json();
  }
  return undefined as T;
}

export interface MfaSetupResponse {
  secret: string;
  otpauth_uri: string;
}

export interface MfaConfirmResponse {
  recovery_codes: string[];
}

export const setupMfa = (): Promise<MfaSetupResponse> =>
  mfaFetch<MfaSetupResponse>("setup");

export const confirmMfa = (code: string): Promise<MfaConfirmResponse> =>
  mfaFetch<MfaConfirmResponse>("confirm", { code });

export const disableMfa = (code: string): Promise<void> =>
  mfaFetch<void>("disable", { code });
