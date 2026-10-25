import { requireCompany } from "@/lib/company";
import { balances, fiscalYears, pickYear, unbookedResult } from "@/lib/ledger";
import { fmt0 } from "@/lib/money";
import { YearSelect } from "../../year-select";
import { Group, inRange } from "../report";

export const dynamic = "force-dynamic";

export default async function Balans({ searchParams }: { searchParams: Promise<{ ar?: string }> }) {
  const { ar } = await searchParams;
  const company = await requireCompany();
  const [years, year] = await Promise.all([fiscalYears(company.id), pickYear(company.id, ar)]);
  const y = year.start_date.slice(0, 4);
  const bal = await balances(company.id, year.start_date, year.end_date);
  const assets = inRange(bal, 1000, 1999).reduce((s, r) => s + r.debit - r.credit, 0);
  const eqDebt = inRange(bal, 2000, 2999).reduce((s, r) => s + r.credit - r.debit, 0);
  const result = unbookedResult(bal);
  return (
    <div>
      <div className="mb-4 flex items-center gap-4"><h1 className="text-2xl font-semibold">Balansräkning {y}</h1><YearSelect years={years} current={year} /></div>
      <table className="ledger">
        <tbody>
          <Group title="Tillgångar" rows={inRange(bal, 1000, 1999)} sign={1} year={y} />
          <tr className="font-semibold"><td colSpan={2}>Summa tillgångar</td><td className="num">{fmt0(assets)}</td></tr>
          <tr><td colSpan={3}>&nbsp;</td></tr>
          <Group title="Eget kapital och skulder" rows={inRange(bal, 2000, 2999)} sign={-1} year={y} />
          <tr><td></td><td>Beräknat resultat</td><td className="num">{fmt0(result)}</td></tr>
          <tr className="font-semibold"><td colSpan={2}>Summa eget kapital och skulder</td><td className="num">{fmt0(eqDebt + result)}</td></tr>
        </tbody>
      </table>
      <p className={`mt-3 text-sm ${Math.abs(assets - eqDebt - result) < 0.005 ? "text-green-700" : "text-red-700"}`}>
        {Math.abs(assets - eqDebt - result) < 0.005 ? "Balansräkningen balanserar." : "Balansräkningen balanserar inte – kontrollera verifikationerna."}
      </p>
    </div>
  );
}
