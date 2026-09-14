import { useState, type FormEvent } from "react";
import { advisors, DEMO_PASSWORD, type Advisor } from "../mock/data";
import { Card, Label } from "../components/ui";

/** Finds the account for an email or FC code, case-insensitively. */
export function findAccount(identity: string): Advisor | undefined {
  const q = identity.trim().toLowerCase();
  if (!q) return undefined;
  return advisors.find((a) => a.email.toLowerCase() === q || a.fc_code.toLowerCase() === q);
}

const field =
  "mt-1.5 w-full rounded-xl border bg-white px-3.5 py-[11px] text-[15px] text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16";

/** Personalised sign-in: each consultant lands on their own pages. Placeholder credentials until real auth exists. */
export default function Login({ onLogin }: { onLogin: (advisor: Advisor, remember: boolean) => void }) {
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const account = findAccount(identity);
    if (!account) return setError("No account for that email or FC code.");
    if (password !== DEMO_PASSWORD) return setError("Wrong password.");
    setError(null);
    onLogin(account, remember);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-canvas px-4 pb-8 pt-[max(28px,env(safe-area-inset-top))] sm:border-x sm:border-line">
      <div className="mt-6 flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-[17px] font-extrabold text-white" aria-hidden="true">
          F
        </span>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[.13em] text-accent">Finexis tracker</div>
          <h1 className="text-[22px] font-bold leading-tight tracking-[-.015em] text-ink">Sign in</h1>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-[1.5] text-muted">Your production, your goals, your clients. Sign in to see your own page.</p>

      <Card className="mt-5">
        <form onSubmit={submit} noValidate>
          <label className="block text-[12px] text-muted" htmlFor="login-identity">
            Email or FC code
          </label>
          <input
            id="login-identity"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder="name@finexis.com.sg or FC001"
            className={`${field} ${error && !findAccount(identity) ? "border-warn" : "border-line"}`}
          />
          <label className="mt-3.5 block text-[12px] text-muted" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className={`${field} ${error === "Wrong password." ? "border-warn" : "border-line"}`}
          />
          {error && (
            <p className="mt-2 text-[12px] text-warn" role="alert">
              {error}
            </p>
          )}
          <label className="mt-3.5 flex items-center gap-2 text-[13px] text-body">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-accent" />
            Stay signed in on this phone
          </label>
          <button type="submit" className="btn-primary mt-4 block w-full rounded-xl py-3.5 text-center text-[15px] font-semibold">
            Sign in
          </button>
        </form>
      </Card>

      <details className="mt-4 rounded-2xl border border-dashed border-line bg-white/60 px-4 py-3 text-[12px] text-muted">
        <summary className="cursor-pointer font-semibold text-accent">Demo accounts for the trial</summary>
        <p className="mt-2">
          Password for every account: <span className="tnum font-semibold text-ink">{DEMO_PASSWORD}</span>. Placeholder sign-in; real accounts come with the
          production build.
        </p>
        <ul className="mt-2 divide-y divide-line">
          {advisors.map((a) => (
            <li key={a.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0">
                <span className="block truncate font-medium text-body">
                  {a.name}
                  {a.manager_id === null && <span className="ml-1.5 rounded bg-accent-soft px-1 py-px text-[9px] font-bold uppercase tracking-[.05em] text-accent">Manager</span>}
                </span>
                <span className="block truncate">{a.email}</span>
              </span>
              <span className="tnum shrink-0">{a.fc_code}</span>
            </li>
          ))}
        </ul>
      </details>
      <div className="mt-2">
        <Label>Mockup</Label>
        <p className="mt-1 text-[11px] leading-[1.5] text-muted">Everything you log or set here stays on this device and resets when the page reloads. Figures are placeholders until the business confirms them.</p>
      </div>
    </div>
  );
}
