// Sign-in for the team sheet: an adviser or manager enters their email and
// password. Shown only when the private team sheet is in the build.
import { useState, type FormEvent } from "react";

export default function SignIn({ onSignIn }: { onSignIn: (email: string, password: string) => Promise<boolean> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await onSignIn(email, password);
    setBusy(false);
    if (!ok) setError("That email and password don't match. Check them and try again.");
  };

  const field =
    "h-12 w-full rounded-xl border border-hairline bg-surface px-3.5 text-[16px] font-semibold text-ink placeholder:font-normal placeholder:text-muted focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16";
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-canvas sm:border-x sm:border-line">
      <section className="bg-brand px-5 pb-8 pt-[max(28px,env(safe-area-inset-top))] text-white">
        <div className="text-[11px] font-extrabold uppercase tracking-[.13em] text-white/72">Final Sprint tracker</div>
        <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-[-.015em]">Sign in</h1>
        <p className="mt-1.5 text-[13px] leading-[1.5] text-white/80">Your production, your goals and, for managers, your team.</p>
      </section>
      <form onSubmit={submit} className="-mt-4 mx-4 flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="signin-email" className="text-[13px] font-bold text-ink">
            Email
          </label>
          <input
            id="signin-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            placeholder="name@finexis.com.sg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="signin-password" className="text-[13px] font-bold text-ink">
            Password
          </label>
          <div className="relative">
            <input
              id="signin-password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${field} pr-16`}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-pressed={show}
              className="absolute right-2 top-1/2 h-9 -translate-y-1/2 rounded-lg px-2.5 text-[12px] font-bold text-accent hover:bg-accent-soft"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-flag/8 px-3 py-2 text-[12.5px] leading-[1.45] text-flag">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn-primary h-12 rounded-xl text-[15px] font-extrabold disabled:opacity-45">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="px-6 pb-8 pt-4 text-center text-[11.5px] leading-[1.5] text-muted">You see your own figures. Your managers see you in their team.</p>
    </div>
  );
}
