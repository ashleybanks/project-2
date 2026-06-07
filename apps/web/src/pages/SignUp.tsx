import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signUp } from "../lib/auth-client";

export default function SignUp() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError("");

    const result = await signUp.email({
      email: form.get("email") as string,
      password: form.get("password") as string,
      name: form.get("name") as string,
    });

    if (result.error) {
      setError(result.error.message ?? "Registration failed");
    } else {
      navigate("/app/dashboard");
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "80px auto", padding: "0 16px" }}>
      <h1>Create account</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Name</label>
          <input name="name" type="text" autoComplete="name" style={{ display: "block", width: "100%", marginBottom: 12 }} />
        </div>
        <div>
          <label>Email</label>
          <input name="email" type="email" required autoComplete="email" style={{ display: "block", width: "100%", marginBottom: 12 }} />
        </div>
        <div>
          <label>Password</label>
          <input name="password" type="password" required minLength={8} autoComplete="new-password" style={{ display: "block", width: "100%", marginBottom: 12 }} />
        </div>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit">Create account</button>
      </form>
      <p>Already have an account? <Link to="/sign-in">Sign in</Link></p>
    </div>
  );
}
