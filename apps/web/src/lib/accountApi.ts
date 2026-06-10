async function accountFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/auth/account/${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error(body.message ?? body.error ?? res.statusText),
      { code: body.error },
    );
  }
  if (res.status === 200 && res.headers.get("content-type")?.includes("application/json")) {
    return res.json();
  }
  return undefined as T;
}

export interface AccountProfile {
  name: string | null;
  email: string;
  has_password: boolean;
  google_linked: boolean;
  mfa_enabled: boolean;
}

export interface UpdateProfileResponse {
  name: string;
}

export const getAccountProfile = (): Promise<AccountProfile> =>
  accountFetch<AccountProfile>("profile");

export const updateProfile = (name: string): Promise<UpdateProfileResponse> =>
  accountFetch<UpdateProfileResponse>("profile", {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });

export const changePassword = (
  current_password: string,
  new_password: string,
): Promise<void> =>
  accountFetch<void>("change-password", {
    method: "POST",
    body: JSON.stringify({ current_password, new_password }),
  });
