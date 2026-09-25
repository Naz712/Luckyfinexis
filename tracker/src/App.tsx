// The shell: who is signed in, where the data comes from, the tabs and the
// header. A manager has two views: their own numbers (Home, Goals,
// Calculator, like any FC) and their team (Team and the Calculator), never
// both on one screen. Data is the monthly production import: the bundled sample
// (the stand-in) or, with a server connected and an individual link opened,
// the signed-in FA's own rows from the server. Everything else is derived.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./lib/privateRates";
import { case_records, DEFAULT_USER_ID, import_rows, MANAGER_USER_ID, TODAY, type BandingCode, type ImportRow, type Tier } from "./mock/data";
import { casesForAdvisor, defaultGoalSet, periodBounds, weeksLeftIn, withAdvisorTier, type GoalSet, type PrimaryGoal } from "./lib/calc";
import { advisorsFromRows, asOf, entriesFromRows } from "./lib/importer";
import { isoDay } from "./lib/format";
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
  /** A manager's view: their team or their own numbers; null means the default, the team. */
  const [view, setView] = useState<"me" | "team" | null>(null);

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
  // Case-by-case records: the sample's made-up cases alongside the sample import; the server does not send any yet.
  const records = source.kind === "server" ? [] : case_records;
  const me = advisors.find((a) => a.id === userId) ?? advisors.find((a) => a.id === DEFAULT_USER_ID) ?? advisors[0]!;
  const isManager = advisors.some((a) => a.manager_id === me.id);
  const teamView = isManager && (view ?? "team") === "team";
  const myCases = casesForAdvisor(me.id, cases);
  // The team view is the team and the Calculator; the own view is what any FC sees.
  const visibleTabs = teamView ? (["team", "calculator"] as Tab[]).map((id) => TABS.find((t) => t.id === id)!) : TABS.filter((t) => !t.managerOnly);
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : visibleTabs[0]!.id;

  // Self-set goals, in memory only. Goals edits them in place; Home and Calculator read them.
  const [goalSet, setGoalSet] = useState<GoalSet>(defaultGoalSet);
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>({ kind: "tier" });
  // The Calculator works at the FC's own band only.
  const bandInUse: BandingCode = me.banding_code;
  const setTier = (tier: Tier) => setGoalSet((set) => withAdvisorTier(set, me.id, TODAY.getFullYear(), tier));

  const onApiChange = (next: ApiSettings) => {
    saveApiSettings(next);
    setApi(next);
  };
  const onSessionChange = (next: Session | null) => {
    saveSession(next);
    setSession(next);
  };

  /** Stand-in only: flips between the sample FC and their manager (who opens on the team) so every screen can be reviewed. */
  const switchUser = () => {
    setPrimaryGoal({ kind: "tier" });
    setView(null);
    const manager = advisors.find((a) => advisors.some((b) => b.manager_id === a.id))?.id ?? MANAGER_USER_ID;
    const fc = advisors.find((a) => a.manager_id !== null)?.id ?? DEFAULT_USER_ID;
    setUserId(isManager ? fc : manager);
    setTab(isManager ? "home" : "team");
  };
  /** A signed-in manager: between the team and their own numbers. */
  const switchView = () => {
    setView(teamView ? "me" : "team");
    setTab(teamView ? "home" : "team");
  };
  // A readable chip on either background: outlined on the white header, tonal white on the blue hero.
  const switchClass = {
    light: "h-8 whitespace-nowrap rounded-full border border-hairline bg-surface px-3 text-[12px] font-semibold text-body hover:border-accent hover:text-accent",
    dark: "h-8 whitespace-nowrap rounded-full bg-white/16 px-3 text-[12px] font-semibold text-white ring-1 ring-white/30 hover:bg-white/24",
  } as const;
  const viewSwitch = (tone: "light" | "dark"): ReactNode =>
    source.kind === "server" ? (
      isManager ? (
        <button type="button" onClick={switchView} className={switchClass[tone]}>
          {teamView ? "My numbers" : "My team"}
        </button>
      ) : null
    ) : (
      <button type="button" onClick={switchUser} className={switchClass[tone]} title="Mockup only: switch between the sample FC and their manager's team view">
        {isManager ? "FC view" : "Manager view"}
      </button>
    );
  const headerExtra: ReactNode = (
    <>
      {viewSwitch("light")}
      <AskButton onClick={() => setAskOpen(true)} />
    </>
  );
  const heroExtra: ReactNode = (
    <>
      {viewSwitch("dark")}
      <AskButton onClick={() => setAskOpen(true)} tone="dark" />
    </>
  );

  const yearPeriod = periodBounds("jan_dec", TODAY);
  const weeksLeft = weeksLeftIn(yearPeriod, TODAY);
  const headerNote: Record<Exclude<Tab, "home">, ReactNode> = {
    goals: `${weeksLeft} weeks left in ${TODAY.getFullYear()}`,
    calculator: null,
    team: `${advisors.filter((a) => a.manager_id === me.id).length} FCs · ${source.kind === "server" && source.as_of ? `as of ${isoDay(source.as_of)}` : "sample import"}`,
  };

  // The header's height, for anything that sticks just under it (the team drill-down's banner).
  const headerRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeTab]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-canvas sm:border-x sm:border-line">
      {activeTab !== "home" && (
        <header ref={headerRef} className="sticky top-0 z-10 border-b border-line bg-surface px-5 pb-3 pt-[max(6px,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-2.5">
            <div className="min-w-0">
              <div className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[.13em] text-accent">Final Sprint tracker</div>
              <div className="mt-0.5 truncate text-[22px] font-bold leading-tight tracking-[-.015em] text-ink">{TABS.find((t) => t.id === activeTab)?.label}</div>
              {headerNote[activeTab] && <div className="tnum mt-0.5 truncate text-[11px] leading-[1.45] text-muted">{headerNote[activeTab]}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-2">{headerExtra}</div>
          </div>
        </header>
      )}

      <main className="flex-1 pb-[calc(84px+env(safe-area-inset-bottom))]">
        {activeTab === "home" && (
          <Home key={me.id} advisor={me} cases={cases} goalSet={goalSet} primary={primaryGoal} onChangeGoal={() => setTab("goals")} identityExtra={heroExtra} source={source} records={records} />
        )}
        {activeTab === "goals" && (
          <Goals key={me.id} advisor={me} cases={cases} goalSet={goalSet} onGoalSetChange={setGoalSet} primary={primaryGoal} onPrimaryChange={setPrimaryGoal} onTierChange={setTier} />
        )}
        {activeTab === "calculator" && (
          <Calculator
            key={`${me.id}-${teamView}`}
            advisor={me}
            cases={myCases}
            goalSet={goalSet}
            primary={primaryGoal}
            band={bandInUse}
            onGoToGoals={() => setTab("goals")}
            personal={!teamView}
          />
        )}
        {activeTab === "team" && teamView && <Team key={me.id} manager={me} advisors={advisors} cases={cases} goalSet={goalSet} source={source} records={records} />}
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
