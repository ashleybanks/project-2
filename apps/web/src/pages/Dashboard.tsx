import { useNavigate } from "react-router-dom";
import { signOut, useSession } from "../lib/auth-client";

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: session } = useSession();

  async function handleSignOut() {
    await signOut();
    navigate("/sign-in");
  }

  return (
    <div style={{ maxWidth: 600, margin: "80px auto", padding: "0 16px" }}>
      <h1>Dashboard</h1>
      {session?.user && (
        <p>Signed in as <strong>{session.user.email}</strong></p>
      )}
      <button onClick={handleSignOut}>Sign out</button>
    </div>
  );
}
