import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation } from "react-router";
import { z } from "zod";
import { useAuth } from "~/auth/auth-context";
import { MarkIcon } from "~/components/icons";
import { getSupabaseClient } from "~/data/supabase";

const signInSchema = z.object({ email: z.email(), password: z.string().min(8) });
type SignInFields = z.infer<typeof signInSchema>;

export default function SignInRoute() {
  const { session, configured } = useAuth();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignInFields>({ resolver: zodResolver(signInSchema) });
  const destination = (location.state as { from?: string } | null)?.from ?? "/overview";
  if (session) return <Navigate to={destination} replace />;

  async function submit(values: SignInFields) {
    const client = getSupabaseClient();
    if (!client) return;
    setServerError(null);
    const { error } = await client.auth.signInWithPassword(values);
    if (error) setServerError(error.message);
  }

  return (
    <main className="sign-in-page">
      <section className="sign-in-card" aria-labelledby="sign-in-title">
        <div className="sign-in-brand"><MarkIcon /><span>Runway</span></div>
        <p className="eyebrow">Private financial workspace</p>
        <h1 id="sign-in-title">Welcome back</h1>
        <p>Sign in to continue to your runway.</p>
        {!configured && <p className="form-notice" role="status">Add the two Supabase variables from `.env.example` to enable sign-in.</p>}
        <form onSubmit={handleSubmit(submit)} noValidate>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" {...register("email")} aria-invalid={Boolean(errors.email)} />
          {errors.email && <p className="field-error">{errors.email.message}</p>}
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" {...register("password")} aria-invalid={Boolean(errors.password)} />
          {errors.password && <p className="field-error">{errors.password.message}</p>}
          {serverError && <p className="field-error" role="alert">{serverError}</p>}
          <button type="submit" disabled={!configured || isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}
