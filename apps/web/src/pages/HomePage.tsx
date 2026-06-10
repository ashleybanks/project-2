import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const verified = searchParams.get("verified") === "true";

  useEffect(() => {
    if (!verified) {
      navigate("/app/templates", { replace: true });
    }
  }, [verified, navigate]);

  if (!verified) return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="text-4xl mb-4">✓</div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">Email verified</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your account is active. You're all set.
        </p>
        <button
          onClick={() => navigate("/app/templates")}
          className="text-sm text-primary hover:underline font-medium"
        >
          Continue to app →
        </button>
      </div>
    </div>
  );
}
