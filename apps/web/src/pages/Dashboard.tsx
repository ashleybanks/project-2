import { useNavigate } from "react-router-dom";
import { signOut, useSession } from "../lib/auth-client";
import { PageContainer } from "@/components/AppLayout";

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: session } = useSession();

  async function handleSignOut() {
    await signOut();
    navigate("/sign-in");
  }

  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Dashboard</h1>
      {session?.user && (
        <p className="text-sm text-muted-foreground mb-6">
          Signed in as <strong>{session.user.email}</strong>
        </p>
      )}
      <button
        onClick={handleSignOut}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Sign out
      </button>
    </PageContainer>
  );
}
