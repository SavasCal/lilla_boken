import Link from "next/link";
import { requireCompany } from "@/lib/company";
import { fiscalYears, needsReceipt, pickYear, vouchersInYear } from "@/lib/ledger";
import { fmt0, fmtTs } from "@/lib/money";
import { YearSelect } from "../year-select";

export const dynamic = "force-dynamic";

export default async function Grundbok({ searchParams }: { searchParams: Promise<{ ar?: string; saknar?: string }> }) {
  const { ar, saknar } = await searchParams;
  const company = await requireCompany();
  const [years, year] = await Promise.all([fiscalYears(company.id), pickYear(company.id, ar)]);
  const all = await vouchersInYear(year.id);
  const missing = all.filter(needsReceipt).length;
  const vouchers = saknar ? all.filter(needsReceipt) : all;
  const q = `?ar=${year.start_date.slice(0, 4)}`;
  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-2xl font-semibold">Grundbok {year.start_date.slice(0, 4)}</h1>
        <YearSelect years={years} current={year} />
        {missing > 0 && (saknar
          ? <Link className="text-sm underline" href={`/verifikationer${q}`}>Visa alla</Link>
          : <Link className="text-sm text-red-700 underline" href={`/verifikationer${q}&saknar=1`}>{missing} saknar kvitto</Link>)}
        <a className="ml-auto text-sm underline" href={`/api/sie?ar=${year.start_date.slice(0, 4)}`}>Exportera SIE4</a>
      </div>
      <table className="ledger">
        <thead><tr><th>Nr</th><th>Datum</th><th>Beskrivning</th><th>Bilagor</th><th>Rättelse</th><th className="num">Belopp</th><th>Registrerad</th></tr></thead>
        <tbody>
          {vouchers.map((v) => (
            <tr key={v.id} className={v.reversed_by ? "text-stone-400 line-through" : ""}>
              <td><Link className="underline" href={`/verifikationer/${v.id}`}>A{v.number}</Link></td>
              <td>{v.date}</td>
              <td>{v.description}{v.opening && <span className="ml-2 rounded bg-stone-200 px-1.5 text-xs no-underline">IB</span>}</td>
              <td>{needsReceipt(v) ? <span className="rounded bg-red-100 px-1.5 text-xs text-red-800">saknas</span> : v.attachments || ""}</td>
              <td className="no-underline">
                {v.reverses && <span className="text-xs">rättar <Link className="underline" href={`/verifikationer/${v.reverses}`}>A{v.reverses_number}</Link></span>}
                {v.reversed_by && <span className="text-xs">rättad av A{v.reversed_by_number}</span>}
              </td>
              <td className="num">{fmt0(v.total)}</td>
              <td className="text-xs text-stone-500">{fmtTs(v.created_at)}</td>
            </tr>
          ))}
          {vouchers.length === 0 && <tr><td colSpan={7} className="text-stone-500">Inga verifikationer.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
