// Props contracts for the Meeting Pack screens. The container (Packs.tsx)
// owns navigation and the in-memory pack list; each screen is a pure view of
// what it is given plus the callbacks below.
import type { ReactNode } from "react";
import type { Advisor, Client } from "../../mock/data";
import type { Pack, PackInput, PackNumber, PackSource, ReportContent } from "../../mock/packs";

/** What the FC is building on the New pack screen before it becomes a Pack. */
export interface NewPackDraft {
  client: Client | null;
  inputs: PackInput[];
}

export interface PacksHomeProps {
  advisor: Advisor;
  /** Newest first. */
  packs: Pack[];
  onOpen: (packId: string) => void;
  onNew: () => void;
  /** The shell's view-switch pill, shown in the header. */
  extra?: ReactNode;
}

export interface NewPackProps {
  advisor: Advisor;
  /** The FC's clients, for the client picker. */
  clients: Client[];
  draft: NewPackDraft;
  onChange: (draft: NewPackDraft) => void;
  /** "adding" shows the tiles and the Added list; "processing" shows the spinner card with the inputs ticking off. */
  stage: "adding" | "processing";
  /** Index of the input currently being processed while stage is "processing" (earlier ones are done, later ones queued). */
  processingIndex: number;
  onMakeReport: () => void;
  /** Add a sample input of this kind (mockup stand-in for recording, camera, file picker, typing). */
  onAddInput: (kind: PackSource) => void;
  onBack: () => void;
  extra?: ReactNode;
}

export interface CheckNumbersProps {
  pack: Pack;
  numbers: PackNumber[];
  onToggle: (numberId: string) => void;
  /** Enabled only when every number is confirmed; approves the pack. */
  onApprove: () => void;
  onBack: () => void;
  extra?: ReactNode;
}

export interface PackReportProps {
  pack: Pack;
  content: ReportContent;
  inputs: PackInput[];
  /** True when every PackNumber for this pack is confirmed (or there are none). */
  numbersConfirmed: boolean;
  /** How many numbers still need confirming, for the footer helper. */
  unconfirmedCount: number;
  /** Approve and save. The container routes to Check numbers first when any number is unconfirmed. */
  onApprove: () => void;
  /** Hand off to the Log screen with the chosen option prefilled. */
  onLogCase: (opt: { client_name: string; product_id: string; premium: number; term_years: number }) => void;
  /** Stand-in for the PDF export. */
  onShare: () => void;
  onClose: () => void;
  /** Stand-in notice channel ("In the app this…"). */
  notify: (message: string) => void;
}
