import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { signInWithEmail, submitMfaChallenge, resendVerificationEmail } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export default function SignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resetSuccess = searchParams.get("reset") === "true";
  const oauthFailed = searchParams.get("error") === "oauth_failed";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailForResend, setEmailForResend] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  const isUnverified = error === "EMAIL_NOT_VERIFIED";
  const [showPassword, setShowPassword] = useState(false);
  const [mfaPending, setMfaPending] = useState<{ token: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = form.get("email") as string;
    setError("");
    setResendDone(false);
    setLoading(true);
    try {
      const result = await signInWithEmail(email, form.get("password") as string);
      if ("mfa_required" in result) {
        setMfaPending({ token: result.mfa_token });
      } else {
        const redirect = new URLSearchParams(window.location.search).get("redirect") ?? "/app/templates";
        window.location.href = redirect;
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "EMAIL_NOT_VERIFIED") {
        setEmailForResend(email);
        setError("EMAIL_NOT_VERIFIED");
      } else {
        setError(err instanceof Error ? err.message : "Invalid credentials");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!mfaPending) return;
    setMfaError("");
    setMfaLoading(true);
    try {
      await submitMfaChallenge(mfaPending.token, mfaCode);
      const redirect = new URLSearchParams(window.location.search).get("redirect") ?? "/app/templates";
      window.location.href = redirect;
    } catch {
      setMfaError("Invalid code. Please try again.");
      setMfaPending(null);
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleResend() {
    setResendLoading(true);
    await resendVerificationEmail(emailForResend);
    setResendLoading(false);
    setResendDone(true);
  }

  if (mfaPending) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">Two-factor authentication</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {useRecovery ? "Enter one of your recovery codes." : "Enter the code from your authenticator app."}
            </p>
          </div>
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <form onSubmit={handleMfaSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Input
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    type="text"
                    inputMode={useRecovery ? "text" : "numeric"}
                    maxLength={useRecovery ? 8 : 6}
                    placeholder={useRecovery ? "XXXXXXXX" : "000000"}
                    autoComplete="one-time-code"
                    autoFocus
                    required
                  />
                </div>
                {mfaError && <p className="text-sm text-destructive">{mfaError}</p>}
                <Button type="submit" className="w-full" disabled={mfaLoading}>
                  {mfaLoading ? "Verifying…" : "Verify"}
                </Button>
              </form>
              <button
                type="button"
                onClick={() => { setUseRecovery(!useRecovery); setMfaCode(""); }}
                className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-primary"
              >
                {useRecovery ? "Use authenticator code instead" : "Use a recovery code instead"}
              </button>
            </CardContent>
          </Card>
          <p className="text-center text-sm text-muted-foreground mt-6">
            <button type="button" onClick={() => { setMfaPending(null); setMfaCode(""); setMfaError(""); }} className="text-primary hover:underline font-medium">
              Back to sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
        </div>
        {resetSuccess && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 mb-4">
            Password reset successfully. Please sign in.
          </div>
        )}
        {oauthFailed && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 mb-4">
            Google sign-in failed. Please try again.
          </div>
        )}
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <a
              href="/api/auth/google"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors mb-4"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </a>
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-primary">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input id="password" name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" placeholder="••••••••" className="pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1} aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {error && !isUnverified && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              {isUnverified && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <p className="font-medium">Email not verified</p>
                  <p className="mt-0.5">Please verify your email before signing in.</p>
                  {resendDone ? (
                    <p className="mt-1 text-amber-700">Verification email sent — check your inbox.</p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resendLoading}
                      className="mt-1 underline hover:no-underline disabled:opacity-50"
                    >
                      {resendLoading ? "Sending…" : "Resend verification email"}
                    </button>
                  )}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-muted-foreground mt-6">
          No account?{" "}
          <Link to="/sign-up" className="text-primary hover:underline font-medium">Create one</Link>
        </p>
      </div>
    </div>
  );
}
