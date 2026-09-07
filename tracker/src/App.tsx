import { useState } from "react";
import { advisors, cases as seedCases, DEFAULT_USER_ID, MANAGER_USER_ID, TODAY, type Case, type Goal, type Tier } from "./mock/data";
import { advisorById, casesForAdvisor, defaultGoalSet, withAdvisorGoals, withAdvisorTier, type GoalSet } from "./lib/calc";
import Calculator from "./screens/Calculator";
import Home from "./screens/Home";
import Log from "./screens/Log";
import Team from "./screens/Team";
import Clients from "./screens/Clients";
import Goals, { type PrimaryGoal } from "./screens/Goals";
import GoalsEditor from "./screens/GoalsEditor";

type Tab = "home" | "goals" | "calculator" | "log" | "team" | "clients";

const TABS: { id: Tab; label: string; managerOnly?: boolean }[] = [
  { id: "home", label: "Home" },
  { id: "goals", label: "Goals" },
  { id: "calculator", label: "Calculator" },
  { id: "log", label: "Log" },
  { id: "team", label: "Team", managerOnly: true },
  { id: "clients", label: "Clients" },
];

const ICONS: Record<Tab, string> = {
  goals: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm0 3a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
  calculator: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 4v3h8V7H8Zm0 6h2v2H8v-2Zm3 0h2v2h-2v-2Zm3 0h2v5h-2v-5Zm-6 3h2v2H8v-2Zm3 0h2v2h-2v-2Z",
  home: "M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V11Z",
  log: "M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 8h8v2H8v-2Zm0 4h8v2H8v-2Z",
  team: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 19a6 6 0 0 1 12 0v1H2v-1Zm12.5-4.8A6 6 0 0 1 22 19v1h-6v-1a7.9 7.9 0 0 0-1.5-4.8Z",
  clients: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 8.5A8 8 0 0 1 20 20.5V22H4v-1.5Z",
};

/** The user switch is dev-only, unless a shared build opts in with VITE_USER_SWITCH=1. */
const SHOW_USER_SWITCH = import.meta.env.DEV || import.meta.env.VITE_USER_SWITCH === "1";

export default function App() {
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [tab, setTab] = useState<Tab>("home");
  // Cases live in memory only; the Log screen appends pending manual cases here.
  const [cases, setCases] = useState(seedCases);
  const addCase = (c: Case) => setCases((cs) => [...cs, c]);
  const removePendingCase = (id: string) => setCases((cs) => cs.filter((c) => !(c.id === id && c.status === "pending")));
  // Self-set goals, also in memory only. Editing happens on a Goals screen reached from Home.
  const [goalSet, setGoalSet] = useState<GoalSet>(defaultGoalSet);
  const [editingGoals, setEditingGoals] = useState(false);
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>({ kind: "tier" });

  const me = advisorById(userId)!;
  const isManager = advisors.some((a) => a.manager_id === me.id);
  const myCases = casesForAdvisor(me.id, cases);
  const visibleTabs = TABS.filter((t) => !t.managerOnly || isManager);
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : "home";
  const saveGoals = (targets: Goal[], tier: Tier) => {
    setGoalSet((set) => withAdvisorGoals(set, me.id, TODAY.getFullYear(), targets, tier));
    setEditingGoals(false);
  };
  const setTier = (tier: Tier) => setGoalSet((set) => withAdvisorTier(set, me.id, TODAY.getFullYear(), tier));
  const switchUser = () => {
    setEditingGoals(false);
    setPrimaryGoal({ kind: "tier" });
    setUserId(isManager ? DEFAULT_USER_ID : MANAGER_USER_ID);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-canvas sm:border-x sm:border-line">
      <header className="sticky top-0 z-10 border-b border-line bg-white/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-accent">Finexis tracker</div>
            <div className="truncate text-[17px] font-semibold text-ink">{activeTab === "goals" && editingGoals ? "Edit goals" : TABS.find((t) => t.id === activeTab)?.label}</div>
          </div>
          <div className="flex min-w-0 shrink items-center gap-2">
            {SHOW_USER_SWITCH && (
              <button
                type="button"
                onClick={switchUser}
                className="whitespace-nowrap rounded-full border border-dashed border-line px-2 py-1 text-[10px] font-medium text-muted hover:border-accent hover:text-accent"
                title="Mockup only: switch between the FC and manager views"
              >
                {isManager ? "FC view" : "Manager view"}
              </button>
            )}
            <div className="min-w-0 text-right">
              <div className="truncate text-[13px] font-semibold text-ink">{me.name}</div>
              <div className="truncate text-[11px] text-muted">
                {me.banding_code} · {isManager ? "Manager" : me.fc_code}
              </div>
            </div>
            <div className="hidden h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent min-[400px]:grid" aria-hidden="true">
              {me.name
                .split(" ")
                .slice(0, 2)
                .map((s) => s[0])
                .join("")}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-[calc(64px+env(safe-area-inset-bottom))]">
        {activeTab === "home" && <Home key={me.id} advisor={me} cases={cases} goalSet={goalSet} />}
        {activeTab === "goals" &&
          (editingGoals ? (
            <GoalsEditor key={me.id} advisor={me} cases={cases} goalSet={goalSet} onSave={saveGoals} onCancel={() => setEditingGoals(false)} />
          ) : (
            <Goals
              key={me.id}
              advisor={me}
              cases={cases}
              goalSet={goalSet}
              primary={primaryGoal}
              onPrimaryChange={setPrimaryGoal}
              onTierChange={setTier}
              onEdit={() => setEditingGoals(true)}
            />
          ))}
        {activeTab === "calculator" && <Calculator key={me.id} advisor={me} cases={myCases} goalSet={goalSet} />}
        {activeTab === "log" && <Log key={me.id} advisor={me} cases={cases} onAdd={addCase} onRemove={removePendingCase} />}
        {activeTab === "team" && isManager && <Team key={me.id} manager={me} cases={cases} goalSet={goalSet} />}
        {activeTab === "clients" && <Clients key={me.id} advisor={me} cases={cases} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[430px] border-t border-line bg-white pb-[env(safe-area-inset-bottom)]" aria-label="Sections">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}>
          {visibleTabs.map((t) => {
            const active = t.id === activeTab;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full flex-col items-center gap-1 py-2.5 text-[10px] font-semibold ${active ? "text-accent" : "text-muted"}`}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d={ICONS[t.id]} fillRule={t.id === "goals" ? "evenodd" : undefined} />
                  </svg>
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
