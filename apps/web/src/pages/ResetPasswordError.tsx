import { Link } from "react-router-dom";

export default function ResetPasswordError() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight mb-3">Reset link expired</h1>
        <p className="text-sm text-muted-foreground mb-6">
          This reset link has expired or has already been used.
        </p>
        <Link
          to="/forgot-password"
          className="text-sm text-primary hover:underline font-medium"
        >
          Request a new reset link
        </Link>
      </div>
    </div>
  );
}
