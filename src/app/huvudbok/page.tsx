import Link from "next/link";
import { q } from "@/lib/db";
import { requireCompany } from "@/lib/company";
import { balances, fiscalYears, pickYear } from "@/lib/ledger";
import { fmt, fmt0 } from "@/lib/money";
import { YearSelect } from "../year-select";

export const dynamic = "force-dynamic";

type Row = { voucher_id: number; number: number; date: string; description: string; debit: number; credit: number; line_text: string | null };

export default async function Huvudbok({ searchParams }: { searchParams: Promise<{ ar?: string; konto?: string }> }) {
  const { ar, konto } = await searchParams;
  const company = await requireCompany();
  const [years, year] = await Promise.all([fiscalYears(company.id), pickYear(company.id, ar)]);
  const y = year.start_date.slice(0, 4);

  if (konto) {
    const n = Number(konto);
    const [acc] = await q<{ name: string }>("SELECT name FROM accounts WHERE number = $1", [n]);
    const rows = await q<Row>(
      `SELECT v.id AS voucher_id, v.number, v.date, v.description, l.debit, l.credit, l.description AS line_text
         FROM voucher_lines l JOIN vouchers v ON v.id = l.voucher_id
        WHERE l.account = $1 AND v.fiscal_year_id = $2 ORDER BY v.date, v.number, l.id`, [n, year.id]);
    const withSaldo = rows.reduce<(Row & { saldo: number })[]>((acc, r) => [...acc, { ...r, saldo: (acc.at(-1)?.saldo ?? 0) + r.debit - r.credit }], []);
    return (
      <div>
        <p className="text-sm"><Link className="underline" href={`/huvudbok?ar=${y}`}>← Alla konton</Link></p>
        <h1 className="mb-4 text-2xl font-semibold">{n} {acc?.name ?? "Okänt konto"} <span className="text-base font-normal text-stone-500">{y}</span></h1>
        <table className="ledger">
          <thead><tr><th>Datum</th><th>Ver</th><th>Text</th><th className="num">Debet</th><th className="num">Kredit</th><th className="num">Saldo</th></tr></thead>
          <tbody>
            {withSaldo.map((r, i) => (
              <tr key={i}><td>{r.date}</td><td><Link className="underline" href={`/verifikationer/${r.voucher_id}`}>A{r.number}</Link></td>
                <td>{r.line_text || r.description}</td><td className="num">{fmt(r.debit)}</td><td className="num">{fmt(r.credit)}</td><td className="num">{fmt0(r.saldo)}</td></tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-stone-500">Inga transaktioner.</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  const bal = await balances(company.id, year.start_date, year.end_date);
  return (
    <div>
      <div className="mb-4 flex items-center gap-4"><h1 className="text-2xl font-semibold">Huvudbok {y}</h1><YearSelect years={years} current={year} /></div>
      <table className="ledger">
        <thead><tr><th>Konto</th><th>Namn</th><th className="num">Debet</th><th className="num">Kredit</th><th className="num">Saldo</th></tr></thead>
        <tbody>
          {bal.map((b) => (
            <tr key={b.account}><td><Link className="underline" href={`/huvudbok?ar=${y}&konto=${b.account}`}>{b.account}</Link></td><td>{b.name}</td>
              <td className="num">{fmt(b.debit)}</td><td className="num">{fmt(b.credit)}</td><td className="num">{fmt0(b.debit - b.credit)}</td></tr>
          ))}
          {bal.length === 0 && <tr><td colSpan={5} className="text-stone-500">Inga transaktioner.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
