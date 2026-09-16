import { useState, type ReactNode } from "react";
import { advisors, bandings, cases as seedCases, DEFAULT_USER_ID, MANAGER_USER_ID, TODAY, type BandingCode, type Case, type Tier } from "./mock/data";
import { advisorById, casesForAdvisor, clientsForAdvisor, defaultGoalSet, periodBounds, weeksLeftIn, withAdvisorTier, type GoalSet, type PrimaryGoal } from "./lib/calc";
import { pct } from "./lib/format";
import Calculator from "./screens/Calculator";
import Home from "./screens/Home";
import Log from "./screens/Log";
import Team from "./screens/Team";
import Clients from "./screens/Clients";
import Goals from "./screens/Goals";
import Packs, { type LogPrefill } from "./screens/packs/Packs";

type Tab = "home" | "goals" | "calculator" | "log" | "team" | "clients" | "packs";

const TABS: { id: Tab; label: string; managerOnly?: boolean }[] = [
  { id: "home", label: "Home" },
  { id: "goals", label: "Goals" },
  { id: "calculator", label: "Calculator" },
  { id: "log", label: "Log" },
  { id: "team", label: "Team", managerOnly: true },
  { id: "clients", label: "Clients" },
  { id: "packs", label: "Packs" },
];

/** Tab icons from the handoff: an outline at rest, a filled version when active. 23px on a 24 grid. */
function TabIcon({ tab, active }: { tab: Tab; active: boolean }) {
  const p = { width: 23, height: 23, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true as const };
  switch (tab) {
    case "home":
      return (
        <svg {...p}>
          <path d="M3.5 10.8 12 3.8l8.5 7v9.4a.8.8 0 0 1-.8.8H15v-6.5H9V21H4.3a.8.8 0 0 1-.8-.8v-9.4Z" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case "goals":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
          {active ? <circle cx="12" cy="12" r="3.6" fill="currentColor" /> : <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="1.8" />}
        </svg>
      );
    case "calculator":
      return (
        <svg {...p}>
          <rect x="5.2" y="3.2" width="13.6" height="17.6" rx="2.6" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" />
          <path d="M8.4 7.6h7.2" stroke={active ? "var(--color-accent-soft)" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" />
          {[
            [9.4, 12.4],
            [14.6, 12.4],
            [9.4, 16.6],
            [14.6, 16.6],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.1" fill={active ? "var(--color-accent-soft)" : "currentColor"} />
          ))}
        </svg>
      );
    case "log":
      return (
        <svg {...p}>
          <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4.4" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 8.4v7.2M8.4 12h7.2" stroke={active ? "var(--color-accent-soft)" : "currentColor"} strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
    case "clients":
      return active ? (
        <svg {...p}>
          <circle cx="9.6" cy="8.4" r="3.4" fill="currentColor" />
          <path d="M3.4 20.2a6.2 6.2 0 0 1 12.4 0Z" fill="currentColor" />
          <circle cx="17" cy="9.4" r="2.4" fill="currentColor" fillOpacity=".55" />
          <path d="M14.6 16.2a4.4 4.4 0 0 1 6 3.9h-3" fill="currentColor" fillOpacity=".55" />
        </svg>
      ) : (
        <svg {...p}>
          <circle cx="9.6" cy="8.4" r="3.4" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.4 20.2a6.2 6.2 0 0 1 12.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="17.2" cy="9.6" r="2.3" stroke="currentColor" strokeWidth="1.6" />
          <path d="M15.4 16.4a4.3 4.3 0 0 1 5.2 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "packs":
      return (
        <svg {...p}>
          <path d="M7 6.5V4.2a.7.7 0 0 1 .7-.7h8.6l3.2 3.2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M4.5 9.2a.7.7 0 0 1 .7-.7h8.4l3.4 3.4v8.4a.7.7 0 0 1-.7.7H5.2a.7.7 0 0 1-.7-.7V9.2Z" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M7.6 14.6h6.2M7.6 17.6h4.4" stroke={active ? "var(--color-accent-soft)" : "currentColor"} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "team":
      return (
        <svg {...p}>
          <circle cx="8" cy="8.5" r="3" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" />
          <circle cx="16" cy="8.5" r="3" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" />
          <path d="M2.5 19.5a5.5 5.5 0 0 1 11 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill={active ? "currentColor" : "none"} />
          <path d="M14.5 14.3a5.5 5.5 0 0 1 7 5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </svg>
      );
  }
}

export default function App() {
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [tab, setTab] = useState<Tab>("home");
  // Set by the Clients screen's "Case" action; cleared when leaving Log so the next visit starts blank.
  const [logClient, setLogClient] = useState<string | null>(null);
  // Set by a Meeting Pack's "Log the … case": client, product and premium prefilled.
  const [logPrefill, setLogPrefill] = useState<LogPrefill | null>(null);
  const goTo = (t: Tab) => {
    setTab(t);
    if (t !== "log") {
      setLogClient(null);
      setLogPrefill(null);
    }
  };
  // Cases live in memory only; the Log screen appends pending manual cases here.
  const [cases, setCases] = useState(seedCases);
  const addCase = (c: Case) => setCases((cs) => [...cs, c]);
  const removePendingCase = (id: string) => setCases((cs) => cs.filter((c) => !(c.id === id && c.status === "pending")));
  // Self-set goals, also in memory only. Goals edits them in place; Home and Calculator read them.
  const [goalSet, setGoalSet] = useState<GoalSet>(defaultGoalSet);
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>({ kind: "tier" });
  // The Calculator's band lives in the header strip, so the shell holds it.
  const [band, setBand] = useState<BandingCode | null>(null);

  const me = advisorById(userId)!;
  const isManager = advisors.some((a) => a.manager_id === me.id);
  const myCases = casesForAdvisor(me.id, cases);
  const visibleTabs = TABS.filter((t) => !t.managerOnly || isManager);
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : "home";
  const bandInUse = band ?? me.banding_code;
  const setTier = (tier: Tier) => setGoalSet((set) => withAdvisorTier(set, me.id, TODAY.getFullYear(), tier));
  /** Mockup only: flips between the FC and their manager so every screen can be reviewed. */
  const switchUser = () => {
    setPrimaryGoal({ kind: "tier" });
    setBand(null);
    setUserId(isManager ? DEFAULT_USER_ID : MANAGER_USER_ID);
  };
  const viewSwitch: ReactNode = (
    <button
      type="button"
      onClick={switchUser}
      className={`whitespace-nowrap rounded-full border border-dashed px-2 py-1 text-[10px] font-medium ${activeTab === "home" ? "border-white/40 text-white/80 hover:bg-white/15" : "border-line text-muted hover:border-accent hover:text-accent"}`}
      title="Mockup only: switch between the FC and manager views"
    >
      {isManager ? "FC view" : "Manager view"}
    </button>
  );

  const pendingCount = myCases.filter((c) => c.status === "pending").length;
  const weeksLeft = weeksLeftIn(periodBounds("jan_dec", TODAY), TODAY);
  const headerNote: Record<Exclude<Tab, "home" | "packs">, ReactNode> = {
    goals: `${weeksLeft} weeks left in ${TODAY.getFullYear()}`,
    calculator: (
      <>
        Commission per client
        <br />
        before you meet them
      </>
    ),
    log: (
      <>
        {pendingCount} waiting
        <br />
        on Merlin
      </>
    ),
    team: `${advisors.filter((a) => a.manager_id === me.id).length} FCs`,
    clients: `${clientsForAdvisor(me.id).length} clients`,
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-canvas sm:border-x sm:border-line">
      {activeTab !== "home" && activeTab !== "packs" && (
        <header className="sticky top-0 z-10 border-b border-line bg-surface px-5 pb-3 pt-[max(6px,env(safe-area-inset-top))]">
          <div className="flex items-end justify-between gap-2.5">
            <div className="min-w-0">
              <div className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[.13em] text-accent">Finexis tracker</div>
              <div className="mt-0.5 text-[22px] font-bold leading-tight tracking-[-.015em] text-ink">{TABS.find((t) => t.id === activeTab)?.label}</div>
            </div>
            <div className="flex shrink-0 items-end gap-2">
              {viewSwitch}
              <div className="tnum whitespace-nowrap text-right text-[11px] leading-[1.45] text-muted">{headerNote[activeTab]}</div>
            </div>
          </div>
          {activeTab === "calculator" && (
            <div className="mt-[11px] flex items-center gap-2">
              <span className="shrink-0 text-[11px] font-bold uppercase tracking-[.08em] text-muted">Band</span>
              <div className="flex flex-1 gap-0.5 rounded-[9px] bg-canvas p-0.5" role="radiogroup" aria-label="Banding">
                {bandings.map((b) => {
                  const on = b.code === bandInUse;
                  return (
                    <button
                      key={b.code}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setBand(b.code)}
                      className={`flex-1 rounded-[7px] py-[5px] text-center ${on ? "bg-surface shadow-[0_1px_2px_rgba(20,35,94,.14)]" : ""}`}
                    >
                      <div className={`text-[12px] ${on ? "font-bold text-accent" : "font-medium text-muted"}`}>{b.code}</div>
                      <div className={`tnum text-[9.5px] ${on ? "text-muted" : "text-faint"}`}>{pct(b.commission_rate)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </header>
      )}

      <main className="flex-1 pb-[calc(84px+env(safe-area-inset-bottom))]">
        {activeTab === "home" && <Home key={me.id} advisor={me} cases={cases} goalSet={goalSet} primary={primaryGoal} onChangeGoal={() => goTo("goals")} identityExtra={viewSwitch} />}
        {activeTab === "goals" && (
          <Goals key={me.id} advisor={me} cases={cases} goalSet={goalSet} onGoalSetChange={setGoalSet} primary={primaryGoal} onPrimaryChange={setPrimaryGoal} onTierChange={setTier} />
        )}
        {activeTab === "calculator" && <Calculator key={me.id} advisor={me} cases={myCases} goalSet={goalSet} primary={primaryGoal} band={bandInUse} onGoToGoals={() => goTo("goals")} />}
        {activeTab === "log" && (
          <Log
            key={`${me.id}:${logClient ?? ""}:${logPrefill?.productId ?? ""}`}
            advisor={me}
            cases={cases}
            onAdd={addCase}
            onRemove={removePendingCase}
            initialClient={logPrefill?.clientName ?? logClient ?? undefined}
            initialProductId={logPrefill?.productId}
            initialPremium={logPrefill?.premium}
            initialTerm={logPrefill?.termYears}
          />
        )}
        {activeTab === "packs" && (
          <Packs
            key={me.id}
            advisor={me}
            extra={viewSwitch}
            onLogCase={(p) => {
              setLogPrefill(p);
              setTab("log");
            }}
          />
        )}
        {activeTab === "team" && isManager && <Team key={me.id} manager={me} cases={cases} goalSet={goalSet} />}
        {activeTab === "clients" && (
          <Clients
            key={me.id}
            advisor={me}
            cases={cases}
            onLogCase={(client) => {
              setLogClient(client.name);
              setTab("log");
            }}
          />
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[430px] border-t border-line bg-surface px-1 pb-[max(20px,env(safe-area-inset-bottom))] pt-1.5" aria-label="Sections">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}>
          {visibleTabs.map((t) => {
            const active = t.id === activeTab;
            return (
              <li key={t.id}>
                <button type="button" onClick={() => goTo(t.id)} aria-current={active ? "page" : undefined} className="flex w-full flex-col items-center gap-[3px] py-[5px]">
                  <span key={active ? "on" : "off"} className={`grid h-7 w-11 place-items-center rounded-[10px] ${active ? "tab-pop bg-accent-soft text-accent" : "text-faint"}`}>
                    <TabIcon tab={t.id} active={active} />
                  </span>
                  <span className={`text-[10px] ${active ? "font-bold text-accent" : "font-medium text-muted"}`}>{t.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
