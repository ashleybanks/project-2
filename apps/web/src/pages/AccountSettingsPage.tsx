import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import {
  getAccountProfile,
  updateProfile,
  changePassword,
  type AccountProfile,
} from "../lib/accountApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AccountSettingsPage() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Profile section
  const [name, setName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState("");

  // Password section
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    getAccountProfile()
      .then((p) => {
        setProfile(p);
        setName(p.name ?? "");
      })
      .catch(() => setLoadError(true));
  }, []);

  async function handleUpdateName(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Name cannot be empty");
      return;
    }
    setNameError("");
    setNameLoading(true);
    setNameSaved(false);
    try {
      const res = await updateProfile(name.trim());
      setName(res.name);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 3000);
    } catch (err: unknown) {
      setNameError(err instanceof Error ? err.message : "Failed to update name");
    } finally {
      setNameLoading(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);
    setPasswordLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      setPasswordError(
        code === "INVALID_CURRENT_PASSWORD"
          ? "Current password is incorrect"
          : err instanceof Error
            ? err.message
            : "Failed to change password",
      );
    } finally {
      setPasswordLoading(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="w-2/3 mx-auto py-8 px-4 text-sm text-destructive">Failed to load account details.</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="w-2/3 mx-auto py-8 px-4 text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="w-2/3 mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>

      {/* ── Profile ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateName} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(""); }}
                placeholder="Your name"
                maxLength={100}
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <p className="text-sm text-muted-foreground py-1">{profile.email}</p>
            </div>
            {nameError && <p className="text-sm text-destructive">{nameError}</p>}
            {nameSaved && <p className="text-sm text-green-600">Name updated.</p>}
            <Button type="submit" size="sm" disabled={nameLoading}>
              {nameLoading ? "Saving…" : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Security ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {profile.has_password && (
            <div>
              <h3 className="text-base font-medium mb-3">Change password</h3>
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="current-password">Current password</Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(""); }}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
                {passwordSuccess && <p className="text-sm text-green-600">Password updated.</p>}
                <Button type="submit" size="sm" disabled={passwordLoading}>
                  {passwordLoading ? "Updating…" : "Update password"}
                </Button>
              </form>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium">Two-factor authentication</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {profile.mfa_enabled
                    ? "Your account is protected with an authenticator app."
                    : "Add extra security to your account."}
                </p>
              </div>
              <span
                className={`text-xs font-normal px-2 py-0.5 rounded-full ${
                  profile.mfa_enabled
                    ? "bg-green-100 text-green-800"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {profile.mfa_enabled ? "Enabled" : "Not enabled"}
              </span>
            </div>
            <div className="mt-2">
              <Link to="/app/settings/mfa" className="text-xs text-primary hover:underline">
                {profile.mfa_enabled ? "Manage MFA settings" : "Set up two-factor authentication"}
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Connected accounts ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Connected accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3">
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span className="text-sm">Google</span>
            </div>
            <span
              className={`text-xs font-normal px-2 py-0.5 rounded-full ${
                profile.google_linked
                  ? "bg-green-100 text-green-800"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {profile.google_linked ? "Connected" : "Not connected"}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
