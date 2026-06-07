import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signIn } from "../lib/auth-client";

export default function SignIn() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError("");

    const result = await signIn.email({
      email: form.get("email") as string,
      password: form.get("password") as string,
    });

    if (result.error) {
      setError(result.error.message ?? "Invalid credentials");
    } else {
      const redirect = new URLSearchParams(window.location.search).get("redirect") ?? "/app/dashboard";
      navigate(redirect);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "80px auto", padding: "0 16px" }}>
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Email</label>
          <input name="email" type="email" required autoComplete="email" style={{ display: "block", width: "100%", marginBottom: 12 }} />
        </div>
        <div>
          <label>Password</label>
          <input name="password" type="password" required autoComplete="current-password" style={{ display: "block", width: "100%", marginBottom: 12 }} />
        </div>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit">Sign in</button>
      </form>
      <p>No account? <Link to="/sign-up">Sign up</Link></p>
    </div>
  );
}
