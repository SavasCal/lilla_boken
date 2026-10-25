import { requireCompany } from "@/lib/company";
import { balances, fiscalYears, pickYear, resultOf } from "@/lib/ledger";
import { fmt0 } from "@/lib/money";
import { YearSelect } from "../../year-select";
import { Group, inRange } from "../report";

export const dynamic = "force-dynamic";

const GROUPS: [string, number, number][] = [
  ["Rörelsens intäkter", 3000, 3999],
  ["Varor, material och vissa köpta tjänster", 4000, 4999],
  ["Övriga externa kostnader", 5000, 6999],
  ["Personalkostnader, avskrivningar", 7000, 7999],
  ["Finansiella poster, bokslutsdispositioner, skatt", 8000, 8998],
];

export default async function Resultat({ searchParams }: { searchParams: Promise<{ ar?: string }> }) {
  const { ar } = await searchParams;
  const company = await requireCompany();
  const [years, year] = await Promise.all([fiscalYears(company.id), pickYear(company.id, ar)]);
  const y = year.start_date.slice(0, 4);
  const bal = await balances(company.id, year.start_date, year.end_date);
  return (
    <div>
      <div className="mb-4 flex items-center gap-4"><h1 className="text-2xl font-semibold">Resultaträkning {y}</h1><YearSelect years={years} current={year} /></div>
      <table className="ledger">
        <tbody>
          {GROUPS.map(([t, lo, hi]) => <Group key={t} title={t} rows={inRange(bal, lo, hi)} sign={-1} year={y} />)}
          <tr className="border-t-2 border-stone-800 text-lg font-semibold"><td colSpan={2}>Årets resultat</td><td className="num">{fmt0(resultOf(bal))}</td></tr>
        </tbody>
      </table>
      <p className="mt-3 text-xs text-stone-500">Kostnader visas som negativa belopp. Intäkter positiva.</p>
    </div>
  );
}
