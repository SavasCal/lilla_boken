import Link from "next/link";
import { notFound } from "next/navigation";
import { q } from "@/lib/db";
import { requireCompany } from "@/lib/company";
import { voucherLines, type Voucher } from "@/lib/ledger";
import { fmt, fmtTs } from "@/lib/money";
import { reverseVoucher } from "../actions";

export const dynamic = "force-dynamic";

export default async function VoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await requireCompany();
  const [v] = await q<Voucher & { reversed_by: number | null; reversed_by_number: number | null; reverses_number: number | null }>(
    `SELECT v.*, r.id AS reversed_by, r.number AS reversed_by_number, o.number AS reverses_number
       FROM vouchers v LEFT JOIN vouchers r ON r.reverses = v.id LEFT JOIN vouchers o ON o.id = v.reverses
       JOIN fiscal_years fy ON fy.id = v.fiscal_year_id WHERE v.id = $1 AND fy.company_id = $2`, [Number(id) || 0, company.id]);
  if (!v) notFound();
  const [lines, files] = await Promise.all([
    voucherLines(v.id),
    q<{ id: number; filename: string }>("SELECT id, filename FROM attachments WHERE voucher_id = $1 ORDER BY id", [v.id]),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Verifikation A{v.number}</h1>
        <p className="text-sm text-stone-500">{v.date} · {v.description} · registrerad {fmtTs(v.created_at)}</p>
        {v.reverses && <p className="mt-1 text-sm">Rättar <Link className="underline" href={`/verifikationer/${v.reverses}`}>A{v.reverses_number}</Link></p>}
        {v.reversed_by && <p className="mt-1 text-sm text-red-700">Rättad av <Link className="underline" href={`/verifikationer/${v.reversed_by}`}>A{v.reversed_by_number}</Link></p>}
      </div>
      <table className="ledger">
        <thead><tr><th>Konto</th><th>Namn</th><th className="num">Debet</th><th className="num">Kredit</th><th>Radtext</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}><td><Link className="underline" href={`/huvudbok?konto=${l.account}`}>{l.account}</Link></td><td>{l.name}</td>
              <td className="num">{fmt(l.debit)}</td><td className="num">{fmt(l.credit)}</td><td>{l.description}</td></tr>
          ))}
        </tbody>
      </table>
      <section>
        <h2 className="font-semibold">Bilagor</h2>
        {files.length === 0 ? <p className="text-sm text-stone-500">Inga bilagor.</p> : (
          <ul className="list-disc pl-5 text-sm">{files.map((f) => <li key={f.id}><a className="underline" href={`/api/bilaga/${f.id}`} target="_blank">{f.filename}</a></li>)}</ul>
        )}
      </section>
      {!v.reversed_by && !v.reverses && (
        <form action={reverseVoucher}>
          <input type="hidden" name="id" value={v.id} />
          <button className="btn btn-ghost">Skapa rättelse (vänd verifikationen)</button>
          <p className="mt-1 text-xs text-stone-500">Bokförda poster kan inte ändras. Rättelsen bokar alla rader omvänt med dagens datum. Registrera sedan den korrekta verifikationen.</p>
        </form>
      )}
    </div>
  );
}
