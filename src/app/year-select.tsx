import type { FiscalYear } from "@/lib/ledger";

/** GET-form som byter ?ar=YYYY. Behåller övriga parametrar via hidden-fält. */
export function YearSelect({ years, current, extra = {} }: { years: FiscalYear[]; current?: FiscalYear; extra?: Record<string, string> }) {
  if (years.length < 2) return null;
  return (
    <form className="inline">
      {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <select name="ar" defaultValue={current?.start_date.slice(0, 4)} className="text-sm">
        {years.map((y) => <option key={y.id} value={y.start_date.slice(0, 4)}>{y.start_date.slice(0, 4)}</option>)}
      </select>{" "}
      <button className="btn btn-ghost">Byt år</button>
    </form>
  );
}
