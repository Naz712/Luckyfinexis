import { useState } from "react";
import { advisors, cases as seedCases, DEFAULT_USER_ID, MANAGER_USER_ID, type Case } from "./mock/data";
import { advisorById, casesForAdvisor } from "./lib/calc";
import { Stub } from "./components/ui";
import Calculator from "./screens/Calculator";
import Home from "./screens/Home";
import Log from "./screens/Log";

type Tab = "calculator" | "home" | "log" | "team" | "draw";

const TABS: { id: Tab; label: string; managerOnly?: boolean }[] = [
  { id: "home", label: "Home" },
  { id: "calculator", label: "Calculator" },
  { id: "log", label: "Log" },
  { id: "team", label: "Team", managerOnly: true },
  { id: "draw", label: "Draw" },
];

const ICONS: Record<Tab, string> = {
  calculator: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 4v3h8V7H8Zm0 6h2v2H8v-2Zm3 0h2v2h-2v-2Zm3 0h2v5h-2v-5Zm-6 3h2v2H8v-2Zm3 0h2v2h-2v-2Z",
  home: "M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V11Z",
  log: "M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 8h8v2H8v-2Zm0 4h8v2H8v-2Z",
  team: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 19a6 6 0 0 1 12 0v1H2v-1Zm12.5-4.8A6 6 0 0 1 22 19v1h-6v-1a7.9 7.9 0 0 0-1.5-4.8Z",
  draw: "M12 2l2.4 5.2 5.6.6-4.2 3.9 1.2 5.6L12 14.5 7 17.3l1.2-5.6L4 7.8l5.6-.6L12 2Z",
};

export default function App() {
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [tab, setTab] = useState<Tab>("home");
  // Cases live in memory only; the Log screen appends pending manual cases here.
  const [cases, setCases] = useState(seedCases);
  const addCase = (c: Case) => setCases((cs) => [...cs, c]);
  const removePendingCase = (id: string) => setCases((cs) => cs.filter((c) => !(c.id === id && c.status === "pending")));

  const me = advisorById(userId)!;
  const isManager = advisors.some((a) => a.manager_id === me.id);
  const myCases = casesForAdvisor(me.id, cases);
  const visibleTabs = TABS.filter((t) => !t.managerOnly || isManager);
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : "home";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-canvas sm:border-x sm:border-line">
      <header className="sticky top-0 z-10 border-b border-line bg-white/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Finexis tracker</div>
            <div className="text-[17px] font-semibold text-ink">{TABS.find((t) => t.id === activeTab)?.label}</div>
          </div>
          <div className="flex items-center gap-2">
            {import.meta.env.DEV && (
              <button
                type="button"
                onClick={() => setUserId(isManager ? DEFAULT_USER_ID : MANAGER_USER_ID)}
                className="rounded-full border border-dashed border-line px-2 py-1 text-[10px] font-medium text-muted"
                title="Dev only: switch between FC and manager"
              >
                dev: {isManager ? "manager" : "FC"}
              </button>
            )}
            <div className="text-right">
              <div className="text-[13px] font-semibold text-ink">{me.name}</div>
              <div className="text-[11px] text-muted">
                {me.fc_code} · {me.banding_code}
                {isManager ? " · Manager" : ""}
              </div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent" aria-hidden="true">
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
        {activeTab === "calculator" && <Calculator key={me.id} advisor={me} cases={myCases} />}
        {activeTab === "home" && <Home key={me.id} advisor={me} cases={cases} />}
        {activeTab === "log" && <Log key={me.id} advisor={me} cases={cases} onAdd={addCase} onRemove={removePendingCase} />}
        {activeTab === "team" && <Stub title="Team" text="Manager view. Built after Log." />}
        {activeTab === "draw" && <Stub title="Lucky draw" text="Around The World — pass tracker. Existing module plugs in here." />}
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
                    <path d={ICONS[t.id]} />
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
