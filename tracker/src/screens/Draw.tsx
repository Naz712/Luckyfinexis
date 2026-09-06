import { Card, Label } from "../components/ui";

/** Placeholder for the existing Around The World lucky-draw module. */
export default function Draw() {
  return (
    <div className="space-y-3 px-4 pb-6 pt-3">
      <Card>
        <Label>Lucky draw</Label>
        <div className="mt-1 text-[20px] font-semibold leading-tight text-ink">Around The World — pass tracker</div>
        <p className="mt-2 text-[14px] text-body">Existing module plugs in here.</p>
        <div className="mt-4 rounded-xl border border-dashed border-line px-4 py-8 text-center text-[12px] text-muted">
          Gold and blue passes, draw months and prize history will render in this slot from the campaign ledger.
        </div>
      </Card>
      <p className="px-1 text-center text-[11px] text-muted">Passes are imported by the campaign mastersheet importer; nothing here is mocked.</p>
    </div>
  );
}
