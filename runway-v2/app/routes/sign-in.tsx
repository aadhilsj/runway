import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router";
import { z } from "zod";
import { useAuth } from "~/auth/auth-context";
import { MarkIcon } from "~/components/icons";
import { getSupabaseClient } from "~/data/supabase";

const emailSchema = z.email();

export default function SignInRoute() {
  const { session, configured } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const destination = (location.state as { from?: string } | null)?.from ?? "/overview";
  if (session) return <Navigate to={destination} replace />;

  async function sendEmail(event: FormEvent) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      setServerError("Enter a valid email address.");
      return;
    }
    const client = getSupabaseClient();
    if (!client) return;
    setIsSubmitting(true);
    setServerError(null);
    setStatus(null);
    const { error } = await client.auth.signInWithOtp({
      email: parsed.data,
      options: {
        emailRedirectTo: window.location.origin,
        // First-time household members need to be able to create their own
        // account before the empty-workspace onboarding can appear.
        shouldCreateUser: true,
      },
    });
    setIsSubmitting(false);
    if (error) {
      setServerError("The sign-in email could not be sent. Check the address and try again.");
      return;
    }
    setPendingEmail(parsed.data);
    setStatus(`Sign-in email sent to ${parsed.data}. Open the link or enter the code below.`);
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!pendingEmail) return;
    const token = code.replace(/\s+/g, "").trim();
    if (!token) {
      setServerError("Enter the code from your email.");
      return;
    }
    const client = getSupabaseClient();
    if (!client) return;
    setIsSubmitting(true);
    setServerError(null);
    const { error } = await client.auth.verifyOtp({ email: pendingEmail, token, type: "email" });
    setIsSubmitting(false);
    if (error) setServerError("That code could not be verified. Request a new email and try again.");
  }

  function changeEmail() {
    setPendingEmail(null);
    setCode("");
    setServerError(null);
    setStatus(null);
  }

  return (
    <main className="sign-in-page">
      <section className="sign-in-card" aria-labelledby="sign-in-title">
        <div className="sign-in-brand"><MarkIcon /><span>Runway</span></div>
        <p className="eyebrow">Private financial workspace</p>
        <h1 id="sign-in-title">Welcome back</h1>
        <p>Use the secure link or one-time code sent to your email.</p>
        {!configured && <p className="form-notice" role="status">Add the two Supabase variables from `.env.example` to enable sign-in.</p>}
        {!pendingEmail ? (
          <form onSubmit={sendEmail} noValidate>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(serverError)} />
            {serverError && <p className="field-error" role="alert">{serverError}</p>}
            <button type="submit" disabled={!configured || isSubmitting}>{isSubmitting ? "Sending…" : "Send sign-in email"}</button>
          </form>
        ) : (
          <form onSubmit={verifyCode} noValidate>
            <label htmlFor="code">One-time code</label>
            <input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} autoFocus />
            {status && <p className="form-notice" role="status">{status}</p>}
            {serverError && <p className="field-error" role="alert">{serverError}</p>}
            <button type="submit" disabled={!configured || isSubmitting}>{isSubmitting ? "Verifying…" : "Verify code"}</button>
            <button type="button" onClick={changeEmail}>Use a different email</button>
          </form>
        )}
      </section>
    </main>
  );
}
