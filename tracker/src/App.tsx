// The shell: who is signed in, where the data comes from, the four tabs and
// the header. Data is the monthly production import: the bundled sample
// (the stand-in) or, with a server connected and an individual link opened,
// the signed-in FA's own rows from the server. Everything else is derived.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import "./lib/privateRates";
import { bandings, DEFAULT_USER_ID, import_rows, MANAGER_USER_ID, TODAY, type BandingCode, type ImportRow, type Tier } from "./mock/data";
import { casesForAdvisor, defaultGoalSet, periodBounds, weeksLeftIn, withAdvisorTier, type GoalSet, type PrimaryGoal } from "./lib/calc";
import { advisorsFromRows, asOf, entriesFromRows } from "./lib/importer";
import { isoDay, pct } from "./lib/format";
import { fetchMe, loadApiSettings, loadSession, saveApiSettings, saveSession, type ApiSettings, type DataSource, type Session } from "./lib/api";
import Home from "./screens/Home";
import Goals from "./screens/Goals";
import Calculator from "./screens/Calculator";
import Team from "./screens/Team";
import AskSheet, { AskButton } from "./components/Ask";

type Tab = "home" | "goals" | "calculator" | "team";

const TABS: { id: Tab; label: string; managerOnly?: boolean }[] = [
  { id: "home", label: "Home" },
  { id: "goals", label: "Goals" },
  { id: "calculator", label: "Calculator" },
  { id: "team", label: "Team", managerOnly: true },
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
  const [tab, setTab] = useState<Tab>("home");
  const [api, setApi] = useState<ApiSettings>(loadApiSettings);
  const [session, setSession] = useState<Session | null>(loadSession);
  const [rows, setRows] = useState<ImportRow[]>(import_rows);
  const [source, setSource] = useState<DataSource>({ kind: "sample" });
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [askOpen, setAskOpen] = useState(false);

  // With a server and an individual link, the FA's own rows replace the sample. Anything else keeps the sample and says why.
  useEffect(() => {
    if (!api.url || !session) {
      setRows(import_rows);
      setSource({ kind: "sample" });
      return;
    }
    let cancelled = false;
    fetchMe(api, session)
      .then((me) => {
        if (cancelled) return;
        if (me.rows.length === 0) {
          setRows(import_rows);
          setSource({ kind: "error", message: `The server has no production rows for ${session.fc_code} yet.` });
          return;
        }
        setRows(me.rows);
        setUserId(me.fc_code);
        setSource({ kind: "server", as_of: me.as_of ?? asOf(me.rows) });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setRows(import_rows);
        setSource({ kind: "error", message: e instanceof Error ? e.message : "Could not load your production from the server." });
      });
    return () => {
      cancelled = true;
    };
  }, [api, session]);

  const advisors = useMemo(() => advisorsFromRows(rows), [rows]);
  const cases = useMemo(() => entriesFromRows(rows), [rows]);
  const me = advisors.find((a) => a.id === userId) ?? advisors.find((a) => a.id === DEFAULT_USER_ID) ?? advisors[0]!;
  const isManager = advisors.some((a) => a.manager_id === me.id);
  const myCases = casesForAdvisor(me.id, cases);
  const visibleTabs = TABS.filter((t) => !t.managerOnly || isManager);
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : "home";

  // Self-set goals, in memory only. Goals edits them in place; Home and Calculator read them.
  const [goalSet, setGoalSet] = useState<GoalSet>(defaultGoalSet);
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>({ kind: "tier" });
  // The Calculator's band lives in the header strip, so the shell holds it.
  const [band, setBand] = useState<BandingCode | null>(null);
  const bandInUse = band ?? me.banding_code;
  const setTier = (tier: Tier) => setGoalSet((set) => withAdvisorTier(set, me.id, TODAY.getFullYear(), tier));

  const onApiChange = (next: ApiSettings) => {
    saveApiSettings(next);
    setApi(next);
  };
  const onSessionChange = (next: Session | null) => {
    saveSession(next);
    setSession(next);
  };

  /** Stand-in only: flips between the sample FC and their manager so every screen can be reviewed. */
  const switchUser = () => {
    setPrimaryGoal({ kind: "tier" });
    setBand(null);
    const manager = advisors.find((a) => advisors.some((b) => b.manager_id === a.id))?.id ?? MANAGER_USER_ID;
    const fc = advisors.find((a) => a.manager_id !== null)?.id ?? DEFAULT_USER_ID;
    setUserId(isManager ? fc : manager);
  };
  const viewSwitch: ReactNode =
    source.kind === "server" ? null : (
      <button
        type="button"
        onClick={switchUser}
        className="rounded-full border border-dashed border-hairline px-2.5 py-1 text-[11px] font-medium text-muted hover:border-accent hover:text-accent"
        title="Mockup only: switch between the sample FC and their manager"
      >
        {isManager ? "FC view" : "Manager view"}
      </button>
    );
  const headerExtra: ReactNode = (
    <>
      {viewSwitch}
      <AskButton onClick={() => setAskOpen(true)} />
    </>
  );
  const heroExtra: ReactNode = (
    <>
      {viewSwitch}
      <AskButton onClick={() => setAskOpen(true)} tone="dark" />
    </>
  );

  const yearPeriod = periodBounds("jan_dec", TODAY);
  const weeksLeft = weeksLeftIn(yearPeriod, TODAY);
  const headerNote: Record<Exclude<Tab, "home">, ReactNode> = {
    goals: `${weeksLeft} weeks left in ${TODAY.getFullYear()}`,
    calculator: null,
    team: (
      <>
        {advisors.filter((a) => a.manager_id === me.id).length} FCs
        <br />
        {source.kind === "server" && source.as_of ? `as of ${isoDay(source.as_of)}` : "sample import"}
      </>
    ),
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-canvas sm:border-x sm:border-line">
      {activeTab !== "home" && (
        <header className="sticky top-0 z-10 border-b border-line bg-surface px-5 pb-3 pt-[max(6px,env(safe-area-inset-top))]">
          <div className="flex items-end justify-between gap-2.5">
            <div className="min-w-0">
              <div className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[.13em] text-accent">Finexis tracker</div>
              <div className="mt-0.5 truncate text-[22px] font-bold leading-tight tracking-[-.015em] text-ink">{TABS.find((t) => t.id === activeTab)?.label}</div>
            </div>
            <div className="flex shrink-0 items-end gap-2">
              {headerExtra}
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
        {activeTab === "home" && (
          <Home key={me.id} advisor={me} cases={cases} goalSet={goalSet} primary={primaryGoal} onChangeGoal={() => setTab("goals")} identityExtra={heroExtra} source={source} />
        )}
        {activeTab === "goals" && (
          <Goals key={me.id} advisor={me} cases={cases} goalSet={goalSet} onGoalSetChange={setGoalSet} primary={primaryGoal} onPrimaryChange={setPrimaryGoal} onTierChange={setTier} />
        )}
        {activeTab === "calculator" && <Calculator key={me.id} advisor={me} cases={myCases} goalSet={goalSet} primary={primaryGoal} band={bandInUse} onGoToGoals={() => setTab("goals")} />}
        {activeTab === "team" && isManager && <Team key={me.id} manager={me} advisors={advisors} cases={cases} goalSet={goalSet} source={source} />}
      </main>
      <AskSheet
        open={askOpen}
        onClose={() => setAskOpen(false)}
        ctx={{ advisor: me, advisors, cases, goalSet }}
        api={api}
        onApiChange={onApiChange}
        session={session}
        onSessionChange={onSessionChange}
        source={source}
      />

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[430px] border-t border-line bg-surface px-1 pb-[max(20px,env(safe-area-inset-bottom))] pt-1.5" aria-label="Sections">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}>
          {visibleTabs.map((t) => {
            const active = t.id === activeTab;
            return (
              <li key={t.id}>
                <button type="button" onClick={() => setTab(t.id)} aria-current={active ? "page" : undefined} className="flex w-full flex-col items-center gap-[3px] py-[5px]">
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
