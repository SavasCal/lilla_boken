import Link from "next/link";
import { requireCompany } from "@/lib/company";
import { balances, pickYear, vouchersInYear, resultOf, netOf, needsReceipt } from "@/lib/ledger";
import { fmt0, fmtKr } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Home() {
  const company = await requireCompany();
  const year = await pickYear(company.id);
  const [bal, vouchers] = await Promise.all([balances(company.id, year.start_date, year.end_date), vouchersInYear(year.id)]);
  const bank = bal.filter((b) => b.account >= 1900 && b.account < 2000).reduce((s, b) => s + b.debit - b.credit, 0);
  const result = resultOf(bal);
  const tax = Math.max(0, result) * 0.206; // ponytail: bolagsskatt 2026, ingen hänsyn till ej avdragsgilla kostnader
  const tiles: [string, number | string, string?][] = [
    ["Kassa & bank (19xx)", bank],
    ["Resultat hittills", result],
    ["Intäkter (3xxx)", netOf(bal, 3000, 3999, -1)],
    ["Kostnader (4xxx–7xxx)", netOf(bal, 4000, 7999)],
    ["Moms i år (2610–2649)", netOf(bal, 2610, 2649, -1)],
    ["Skattekonto (1630)", netOf(bal, 1630, 1630)],
    ["Bolagsskatt 20,6 % (beräknad)", tax],
    ["Verifikationer", String(vouchers.length)],
    ["Saknar kvitto", String(vouchers.filter(needsReceipt).length), `/verifikationer?ar=${year.start_date.slice(0, 4)}&saknar=1`],
  ];
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold">{company.name} · {year.start_date.slice(0, 4)}</h1>
          <Link href={`/bokslut/arsredovisning?ar=${year.start_date.slice(0, 4)}`} className="btn btn-ghost ml-auto">Demo: årsredovisning hittills</Link>
        </div>
        <p className="text-sm text-stone-500">{year.start_date} – {year.end_date}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map(([l, v, href]) => {
          const body = <>
            <div className="text-xs uppercase tracking-wide text-stone-500">{l}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{typeof v === "number" ? fmtKr(v) : v}</div>
          </>;
          const cls = "rounded border border-stone-200 bg-white p-4";
          return href ? <Link key={l} href={href} className={`${cls} hover:border-stone-400`}>{body}</Link> : <div key={l} className={cls}>{body}</div>;
        })}
      </div>
      <section>
        <h2 className="mb-2 font-semibold">Senaste verifikationer</h2>
        <table className="ledger">
          <thead><tr><th>Nr</th><th>Datum</th><th>Beskrivning</th><th className="num">Belopp</th></tr></thead>
          <tbody>
            {vouchers.slice(0, 10).map((v) => (
              <tr key={v.id}>
                <td><Link className="underline" href={`/verifikationer/${v.id}`}>A{v.number}</Link></td>
                <td>{v.date}</td><td>{v.description}</td><td className="num">{fmt0(v.total)}</td>
              </tr>
            ))}
            {vouchers.length === 0 && <tr><td colSpan={4} className="text-stone-500">Inga verifikationer ännu. <Link className="underline" href="/verifikationer/ny">Registrera den första</Link>, t.ex. aktiekapitalet.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
