import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import QRCode from "react-qr-code";
import { useSession } from "../lib/auth-client";
import { setupMfa, confirmMfa, disableMfa } from "../lib/mfaApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type Step = "idle" | "setup" | "recovery-codes" | "disabling";

export default function MfaSettingsPage() {
  const { data: session, refetch } = useSession() as { data: { user?: { mfaEnabled?: boolean } } | null, refetch: () => void };
  const mfaEnabled = session?.user?.mfaEnabled ?? false;

  const [step, setStep] = useState<Step>("idle");
  const [otpauthUri, setOtpauthUri] = useState("");
  const [secret, setSecret] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleSetupStart() {
    setError("");
    setLoading(true);
    try {
      const res = await setupMfa();
      setOtpauthUri(res.otpauth_uri);
      setSecret(res.secret);
      setCode("");
      setStep("setup");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await confirmMfa(code);
      setRecoveryCodes(res.recovery_codes);
      setCode("");
      setStep("recovery-codes");
    } catch {
      setError("Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await disableMfa(code);
      setCode("");
      setStep("idle");
      refetch();
    } catch {
      setError("Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopyAll() {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([recoveryCodes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const stepTitle: Record<Step, string> = {
    "idle": "Two-factor authentication",
    "setup": "Set up authenticator",
    "recovery-codes": "Save your recovery codes",
    "disabling": "Disable two-factor authentication",
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <header className="border-b border-border bg-white px-6 py-2.5 flex items-center gap-4 shrink-0">
        <Link
          to="/app/settings/account"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Account settings
        </Link>
        <Separator orientation="vertical" className="h-4" />
        <span className="text-sm font-medium">{stepTitle[step]}</span>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* ── Recovery codes ─────────────────────────────────────────── */}
        {step === "recovery-codes" && (
          <div className="w-2/3 mx-auto py-8 px-4">
            <p className="text-sm text-muted-foreground mb-6">
              These codes can be used to sign in if you lose access to your authenticator app.
              Each code can only be used once. Store them somewhere safe.
            </p>
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {recoveryCodes.map((c) => (
                    <div key={c} className="bg-muted rounded px-3 py-1.5 text-center tracking-widest">
                      {c}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" onClick={handleCopyAll} className="flex-1">
                    {copied ? "Copied!" : "Copy all"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownload} className="flex-1">
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Button className="w-full" onClick={() => { setStep("idle"); refetch(); }}>
              Done — I've saved my codes
            </Button>
          </div>
        )}

        {/* ── Setup ──────────────────────────────────────────────────── */}
        {step === "setup" && (
          <div className="w-2/3 mx-auto py-8 px-4">
            <p className="text-sm text-muted-foreground mb-6">
              Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.),
              then enter the 6-digit code to confirm.
            </p>
            <Card className="mb-6">
              <CardContent className="pt-6 flex flex-col items-center gap-4">
                <div className="bg-white p-4 rounded-lg border">
                  <QRCode value={otpauthUri} size={180} />
                </div>
                <div className="w-full">
                  <p className="text-xs text-muted-foreground mb-1">Or enter this key manually:</p>
                  <p className="font-mono text-sm bg-muted rounded px-3 py-2 break-all select-all">{secret}</p>
                </div>
              </CardContent>
            </Card>
            <form onSubmit={handleConfirm} className="space-y-4">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                autoComplete="one-time-code"
                autoFocus
                required
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Verifying…" : "Confirm code"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("idle")}>
                Cancel
              </Button>
            </form>
          </div>
        )}

        {/* ── Disable ────────────────────────────────────────────────── */}
        {step === "disabling" && (
          <div className="w-2/3 mx-auto py-8 px-4">
            <p className="text-sm text-muted-foreground mb-6">
              Enter your authenticator code or a recovery code to confirm.
            </p>
            <form onSubmit={handleDisable} className="space-y-4">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                type="text"
                inputMode="numeric"
                maxLength={8}
                placeholder="000000"
                autoFocus
                required
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" variant="destructive" className="w-full" disabled={loading}>
                {loading ? "Disabling…" : "Disable MFA"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep("idle"); setCode(""); setError(""); }}>
                Cancel
              </Button>
            </form>
          </div>
        )}

        {/* ── Idle ───────────────────────────────────────────────────── */}
        {step === "idle" && (
          <div className="w-2/3 mx-auto py-8 px-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  Authenticator app
                  <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${mfaEnabled ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
                    {mfaEnabled ? "Enabled" : "Not enabled"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {mfaEnabled ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Your account is protected with an authenticator app. You'll be asked for a code each time you sign in.
                    </p>
                    <Button variant="destructive" size="sm" onClick={() => { setError(""); setCode(""); setStep("disabling"); }}>
                      Disable MFA
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Add an extra layer of security by requiring a code from your authenticator app each time you sign in.
                    </p>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button size="sm" onClick={handleSetupStart} disabled={loading}>
                      {loading ? "Setting up…" : "Set up authenticator"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
