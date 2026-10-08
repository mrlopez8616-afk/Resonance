import { LoginForm } from "@/components/login-form";
import { isLoginConfigured, safeNextPath, webauthnConfig } from "@/lib/auth-core";
import { passkeyCount } from "@/lib/auth-store";
import { readRequestSession } from "@/lib/auth-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in · Resonance 2.0",
};

function reasonCopy(reason: string | undefined, configured: boolean): string | null {
  if (!configured || reason === "unconfigured") return null;
  if (reason === "unavailable") return "Sign-in is unavailable.";
  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);
  const configured = isLoginConfigured();
  if (configured) {
    const live = await readRequestSession();
    if (live?.resetCookie) {
      redirect(`/api/auth/renew?next=${encodeURIComponent(nextPath)}`);
    }
    if (live) redirect(nextPath);
  }

  let passkeyReady = false;
  if (configured && webauthnConfig()) {
    passkeyReady = await passkeyCount().then((count) => count > 0).catch(() => false);
  }
  const note = reasonCopy(params.reason, configured);

  return (
    <main className="auth-screen">
      <section className="auth-card" data-login-card>
        <p className="auth-kicker">Resonance</p>
        <h1 className="auth-title">Sign in</h1>
        {configured ? (
          <>
            <p className="auth-note">Password and a 6-digit authenticator code. This device stays signed in for 30 days.</p>
            {note ? <p className="auth-error">{note}</p> : null}
            <LoginForm passkeyReady={passkeyReady} nextPath={nextPath} />
          </>
        ) : (
          <>
            <p className="auth-note" data-login-unconfigured>
              Login is not configured. The floor stays locked until the sign-in secrets are set.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
