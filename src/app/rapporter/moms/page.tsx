import { requireCompany } from "@/lib/company";
import { balances, fiscalYears, pickYear } from "@/lib/ledger";
import { fmt0 } from "@/lib/money";

export const dynamic = "force-dynamic";

const PERIODS = [
  ["Q1", "01-01", "03-31"], ["Q2", "04-01", "06-30"], ["Q3", "07-01", "09-30"], ["Q4", "10-01", "12-31"],
  ...Array.from({ length: 12 }, (_, i) => { const m = String(i + 1).padStart(2, "0"); return [`M${m}`, `${m}-01`, `${m}-${new Date(2001, i + 1, 0).getDate()}`]; }),
  ["ÅR", "01-01", "12-31"],
];

export default async function Moms({ searchParams }: { searchParams: Promise<{ ar?: string; p?: string }> }) {
  const { ar, p: pParam } = await searchParams;
  const company = await requireCompany();
  const [years, year] = await Promise.all([fiscalYears(company.id), pickYear(company.id, ar)]);
  const y = year.start_date.slice(0, 4);
  const now = new Date();
  const p = pParam ?? (company.vat_period === "manad" ? `M${String(now.getMonth() + 1).padStart(2, "0")}` : company.vat_period === "ar" ? "ÅR" : `Q${Math.floor(now.getMonth() / 3) + 1}`);
  const [, from, to] = PERIODS.find((x) => x[0] === p) ?? PERIODS[0];
  // Februari: PERIODS använder 2001 (ej skottår); justera slutdag för valt år
  const toDate = p === "M02" ? `${y}-02-${new Date(+y, 2, 0).getDate()}` : `${y}-${to}`;
  const bal = await balances(company.id, `${y}-${from}`, toDate);
  const net = (lo: number, hi: number, sign: 1 | -1) => bal.filter((b) => b.account >= lo && b.account <= hi).reduce((s, b) => s + sign * (b.credit - b.debit), 0);
  const r05 = net(3000, 3099, 1), r10 = net(2610, 2619, 1), r11 = net(2620, 2629, 1), r12 = net(2630, 2639, 1), r48 = net(2640, 2649, -1);
  const r49 = r10 + r11 + r12 - r48;
  const rows: [string, string, number][] = [
    ["05", "Momspliktig försäljning (konto 3000–3099)", r05],
    ["10", "Utgående moms 25 % (2610–2619)", r10],
    ["11", "Utgående moms 12 % (2620–2629)", r11],
    ["12", "Utgående moms 6 % (2630–2639)", r12],
    ["48", "Ingående moms att dra av (2640–2649)", r48],
    ["49", r49 >= 0 ? "Moms att betala" : "Moms att få tillbaka", Math.abs(r49)],
  ];
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Momsrapport</h1>
      <form className="mb-4 flex items-end gap-3 text-sm">
        <label>År<br /><select name="ar" defaultValue={y}>{years.map((fy) => <option key={fy.id}>{fy.start_date.slice(0, 4)}</option>)}</select></label>
        <label>Period<br /><select name="p" defaultValue={p}>{PERIODS.map(([k]) => <option key={k}>{k}</option>)}</select></label>
        <button className="btn btn-ghost">Visa</button>
        <span className="text-stone-500">{y}-{from} – {toDate}</span>
      </form>
      <table className="ledger">
        <thead><tr><th>Ruta</th><th>Beskrivning</th><th className="num">Belopp (hela kr)</th></tr></thead>
        <tbody>{rows.map(([n, t, v]) => <tr key={n} className={n === "49" ? "font-semibold" : ""}><td>{n}</td><td>{t}</td><td className="num">{fmt0(Math.round(v)).replace(",00", "")}</td></tr>)}</tbody>
      </table>
      <p className="mt-3 text-xs text-stone-500">Underlag för momsdeklarationen. Hanterar inte EU-handel, omvänd skattskyldighet eller momsfri försäljning (rutor 20–42). Bokför momsredovisningen (2610/2640 → 2650) som en egen verifikation.</p>
    </div>
  );
}
