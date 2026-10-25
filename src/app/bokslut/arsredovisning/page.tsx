import { q } from "@/lib/db";
import { requireCompany } from "@/lib/company";
import { balances, fiscalYears, pickYear, resultOf, unbookedResult, type Balance } from "@/lib/ledger";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

// Uppställning enligt K2 (BFNAR 2016:10), som en vanlig årsredovisning för mindre aktiebolag.
// Kostnader visas som positiva belopp, rader som är noll båda åren döljs om de inte är markerade "alltid".

const net = (b: Balance[], lo: number, hi: number) => b.filter((r) => r.account >= lo && r.account <= hi).reduce((s, r) => s + r.debit - r.credit, 0);
const credit = (b: Balance[], lo: number, hi: number) => -net(b, lo, hi);
const without = (b: Balance[], ...ex: number[]) => b.filter((r) => !ex.includes(r.account));

type F = (b: Balance[]) => number;
type Line = { label: string; f: F; kind?: "sum" | "big" | "head"; always?: boolean };

const RR: Line[] = [
  { label: "Rörelseintäkter, m.m.", f: () => 0, kind: "head" },
  { label: "Nettoomsättning", f: (b) => credit(b, 3000, 3799), always: true },
  { label: "Övriga rörelseintäkter", f: (b) => credit(b, 3800, 3999), always: true },
  { label: "Summa rörelseintäkter, m.m.", f: (b) => credit(b, 3000, 3999), kind: "sum" },
  { label: "Rörelsekostnader", f: () => 0, kind: "head" },
  { label: "Råvaror och förnödenheter", f: (b) => net(b, 4000, 4999) },
  { label: "Övriga externa kostnader", f: (b) => net(b, 5000, 6999), always: true },
  { label: "Personalkostnader", f: (b) => net(b, 7000, 7699), always: true },
  { label: "Av- och nedskrivningar", f: (b) => net(b, 7700, 7899) },
  { label: "Övriga rörelsekostnader", f: (b) => net(b, 7900, 7999), always: true },
  { label: "Rörelseresultat", f: (b) => credit(b, 3000, 7999), kind: "sum" },
  { label: "Finansiella poster", f: () => 0, kind: "head" },
  { label: "Ränteintäkter och liknande resultatposter", f: (b) => credit(b, 8000, 8399) },
  { label: "Räntekostnader och liknande resultatposter", f: (b) => net(b, 8400, 8499), always: true },
  { label: "Resultat efter finansiella poster", f: (b) => credit(b, 3000, 8499), kind: "sum" },
  { label: "Bokslutsdispositioner", f: (b) => credit(b, 8800, 8899) },
  { label: "Resultat före skatt", f: (b) => credit(b, 3000, 8899), kind: "sum" },
  { label: "Skatt på årets resultat", f: (b) => net(b, 8900, 8998), always: true },
  { label: "Årets resultat efter skatt", f: (b) => resultOf(b), kind: "big" },
];

const vatNet: F = (b) => net(b, 2600, 2699); // >0 = momsfordran
// Årets resultat = 2099 (efter bokslut eller i ingående balanser) + resultat som ännu inte omförts.
const yearResult: F = (b) => credit(b, 2099, 2099) + unbookedResult(b);
const retained: F = (b) => credit(b, 2090, 2098);
const fritt: F = (b) => retained(b) + yearResult(b);
const BR: Line[] = [
  { label: "TILLGÅNGAR", f: () => 0, kind: "head" },
  { label: "Anläggningstillgångar", f: (b) => net(b, 1000, 1399) },
  { label: "Omsättningstillgångar", f: () => 0, kind: "head" },
  { label: "Varulager", f: (b) => net(b, 1400, 1499) },
  { label: "Kundfordringar", f: (b) => net(b, 1500, 1599) },
  { label: "Skattekonto", f: (b) => net(b, 1630, 1630) },
  { label: "Övriga fordringar", f: (b) => net(without(b, 1630), 1600, 1799) + Math.max(0, vatNet(b)) },
  { label: "Kassa och bank", f: (b) => net(b, 1900, 1999), always: true },
  { label: "Summa omsättningstillgångar", f: (b) => net(b, 1400, 1999) + Math.max(0, vatNet(b)), kind: "sum" },
  { label: "SUMMA TILLGÅNGAR", f: (b) => net(b, 1000, 1999) + Math.max(0, vatNet(b)), kind: "big" },
];
const EK: Line[] = [
  { label: "Eget kapital", f: () => 0, kind: "head" },
  { label: "Bundet eget kapital", f: () => 0, kind: "head" },
  { label: "Aktiekapital", f: (b) => credit(b, 2081, 2081), always: true },
  { label: "Övrigt bundet eget kapital", f: (b) => credit(without(b, 2081), 2080, 2089) },
  { label: "Summa bundet eget kapital", f: (b) => credit(b, 2080, 2089), kind: "sum" },
  { label: "Fritt eget kapital", f: () => 0, kind: "head" },
  { label: "Balanserat resultat", f: retained, always: true },
  { label: "Årets resultat", f: yearResult, always: true },
  { label: "Summa fritt eget kapital", f: fritt, kind: "sum" },
  { label: "Summa eget kapital", f: (b) => credit(b, 2080, 2089) + fritt(b), kind: "sum" },
  { label: "Obeskattade reserver", f: (b) => credit(b, 2100, 2199) },
  { label: "Långfristiga skulder", f: (b) => credit(b, 2200, 2399) },
  { label: "Kortfristiga skulder", f: () => 0, kind: "head" },
  { label: "Leverantörsskulder", f: (b) => credit(b, 2440, 2449) },
  { label: "Skatteskulder", f: (b) => credit(b, 2500, 2599) + Math.max(0, -vatNet(b)) },
  { label: "Övriga kortfristiga skulder", f: (b) => credit(without(b, ...range(2440, 2449)), 2400, 2499) + credit(b, 2700, 2899) },
  { label: "Upplupna kostnader och förutbetalda intäkter", f: (b) => credit(b, 2900, 2999) },
  { label: "Summa kortfristiga skulder", f: (b) => credit(b, 2400, 2999) - credit(b, 2600, 2699) + Math.max(0, -vatNet(b)), kind: "sum" },
  { label: "SUMMA EGET KAPITAL OCH SKULDER", f: (b) => credit(b, 2000, 2999) - credit(b, 2600, 2699) + Math.max(0, -vatNet(b)) + unbookedResult(b), kind: "big" },
];
function range(lo: number, hi: number) { return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i); }

const kr = (n: number) => {
  const r = Math.round(n);
  return (r < 0 ? "-" : "") + Math.abs(r).toLocaleString("sv-SE").replace(/\u00a0/g, " ");
};

function Page({ company, n, children, first, draft }: { company: { name: string; org_nr: string }; n: number; children: React.ReactNode; first?: boolean; draft: boolean }) {
  return (
    <section className={`relative rounded border border-stone-200 bg-white px-12 pb-10 pt-8 print:rounded-none print:border-0 print:px-0 ${first ? "" : "print:break-before-page"}`} style={{ minHeight: "60rem" }}>
      {draft && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex select-none items-center justify-center overflow-hidden">
          <span className="-rotate-45 text-8xl font-bold uppercase tracking-widest text-red-600/15" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>Preliminär</span>
        </div>
      )}
      <div className="mb-10 text-sm leading-tight"><div>{company.name}</div><div>{company.org_nr}</div></div>
      {children}
      <div className="absolute bottom-6 right-12 text-sm text-stone-500 print:right-0">{n}</div>
    </section>
  );
}

function Statement({ title, lines, cur, prev, y, py, extraHead }: {
  title: string; lines: Line[]; cur: Balance[]; prev: Balance[] | null; y: string; py: string; extraHead?: boolean;
}) {
  const shown = lines.filter((l) => l.kind || l.always || Math.round(l.f(cur)) !== 0 || (prev && Math.round(l.f(prev)) !== 0));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className={extraHead ? "" : "text-base"}>
          <th className="pb-4 text-left font-semibold">{title}</th>
          <th className="w-32 pb-4 text-right font-normal">{y}-12-31</th>
          <th className="w-32 pb-4 text-right font-normal">{py}-12-31</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((l) => l.kind === "head"
          ? <tr key={l.label}><td colSpan={3} className={`pt-4 ${/^[A-ZÅÄÖ ]+$/.test(l.label) ? "font-semibold" : "font-medium"}`}>{l.label}</td></tr>
          : <tr key={l.label} className={l.kind === "big" ? "font-semibold" : l.kind === "sum" ? "font-medium" : ""}>
              <td className={`py-0.5 ${l.kind === "big" ? "pt-4" : ""}`}>{l.label}</td>
              <td className={`py-0.5 text-right tabular-nums ${l.kind === "big" ? "pt-4" : ""}`}>{kr(l.f(cur))}</td>
              <td className={`py-0.5 text-right tabular-nums ${l.kind === "big" ? "pt-4" : ""}`}>{prev ? kr(l.f(prev)) : ""}</td>
            </tr>)}
      </tbody>
    </table>
  );
}

export default async function Arsredovisning({ searchParams }: { searchParams: Promise<{ ar?: string; utdelning?: string; stamma?: string }> }) {
  const { ar, utdelning, stamma } = await searchParams;
  const company = await requireCompany();
  const [years, year] = await Promise.all([fiscalYears(company.id), pickYear(company.id, ar)]);
  const y = year.start_date.slice(0, 4), py = String(Number(y) - 1);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  const prevYear = years.find((f) => f.start_date.startsWith(py));

  // Bara dagens verifikationer, exkl. ingående balanser (de är föregående års UB).
  const [all, ibLines] = await Promise.all([
    balances(company.id, year.start_date, year.end_date),
    q<{ account: number; name: string; debit: number; credit: number }>(
      `SELECT l.account, a.name, sum(l.debit)::numeric(14,2) AS debit, sum(l.credit)::numeric(14,2) AS credit
         FROM voucher_lines l JOIN vouchers v ON v.id = l.voucher_id JOIN accounts a ON a.number = l.account
        WHERE v.fiscal_year_id = $1 AND v.opening GROUP BY l.account, a.name`, [year.id]),
  ]);
  const cur = all;
  // Jämförelseår: föregående år i databasen, annars balansräkningen från ingående balanser (ingen RR då).
  const prevFull = prevYear ? await balances(company.id, prevYear.start_date, prevYear.end_date) : null;
  const prevBR: Balance[] | null = prevFull ?? (ibLines.length ? ibLines : null);

  const board = company.board.split("\n").filter(Boolean);
  const signer = board[0] ?? "______________________";
  const result = yearResult(cur);
  const balanserat = retained(cur);
  const dividend = Math.max(0, Number(utdelning) || 0);
  const stammaDate = stamma || "____________";
  const city = company.seat.split(",")[0] || "Stockholm";

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:max-w-none print:space-y-0">
      <div className="space-y-3 print:hidden">
        {cur.length === 0 && <p className="rounded bg-red-50 p-3 text-sm text-red-800">{company.name} har inga verifikationer {y}, därför är allt noll. Byt företag i sidopanelen.</p>}
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">
          {year.closed_at ? "Räkenskapsåret är stängt." : <><b>Demo.</b> Året är inte stängt. Siffrorna visar bokföringen t.o.m. {today}, utan bokslutsposter som skatt, avskrivningar och periodiseringar.</>}
          {" "}Texterna hämtas från <a className="underline" href="/foretag">Företag &amp; inställningar</a>.
          {!prevFull && " Jämförelseåret har bara balansräkning, hämtad från ingående balanser."}
        </p>
        <form className="flex flex-wrap items-end gap-3 text-sm">
          <input type="hidden" name="ar" value={y} />
          <label>Föreslagen utdelning (kr)<br /><input name="utdelning" defaultValue={utdelning} inputMode="numeric" className="w-36" /></label>
          <label>Årsstämma (datum)<br /><input name="stamma" type="date" defaultValue={stamma} /></label>
          <button className="btn btn-ghost">Uppdatera</button>
          <span className="ml-auto"><PrintButton /></span>
        </form>
      </div>

      <Page company={company} draft={!year.closed_at} n={1} first>
        <h1 className="mb-6 text-2xl font-semibold">Fastställelseintyg</h1>
        <p className="text-sm leading-relaxed">
          Undertecknad styrelseledamot i {company.name} intygar dels att denna kopia av årsredovisningen stämmer överens med originalet,
          dels att balansräkningen och resultaträkningen i årsredovisningen har fastställts på årsstämman den {stammaDate}.
          Årsstämman beslutade att godkänna styrelsens förslag till resultatdisposition.
        </p>
        <p className="mt-10 text-sm">{city} den {stammaDate}</p>
        <p className="mt-14 text-sm">____________________<br />{signer}</p>
      </Page>

      <Page company={company} draft={!year.closed_at} n={2}>
        <h1 className="text-2xl font-semibold">Årsredovisning för räkenskapsåret<br />{year.start_date} - {year.end_date}</h1>
        {!year.closed_at && <p className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-sm text-amber-900">Preliminär per {today}</p>}
        <p className="mt-8 text-sm">Styrelsen avger följande årsredovisning.</p>
        <table className="mt-8 w-full text-sm">
          <thead><tr><th className="text-left font-semibold">Innehåll</th><th className="text-right font-semibold">Sida</th></tr></thead>
          <tbody>{[["förvaltningsberättelse", 3], ["resultaträkning", 4], ["balansräkning", 5], ["Noter", 6]].map(([t, n]) => (
            <tr key={t}><td className="py-0.5 pl-4">- {t}</td><td className="text-right">{n}</td></tr>))}</tbody>
        </table>
        <p className="mt-8 text-sm">Om inte annat särskilt anges, redovisas alla belopp i kronor.</p>
      </Page>

      <Page company={company} draft={!year.closed_at} n={3}>
        <h1 className="mb-6 text-2xl font-semibold">Förvaltningsberättelse</h1>
        <h2 className="font-semibold">Verksamheten</h2>
        <h3 className="mt-2 text-sm font-medium">Allmänt om verksamheten</h3>
        <p className="text-sm">{company.description || <span className="text-stone-400">Fyll i under Företag &amp; inställningar.</span>}</p>
        <p className="mt-3 text-sm">Bolaget har sitt säte i {company.seat || "____________"}.</p>
        <h2 className="mt-8 font-semibold">Resultatdisposition</h2>
        <p className="mt-2 text-sm">Till årsstämmans förfogande står följande vinstmedel:</p>
        <table className="mt-2 w-80 text-sm"><tbody>
          <tr><td>Balanserade vinstmedel:</td><td className="text-right tabular-nums">{kr(balanserat)} kr</td></tr>
          <tr><td>Årets resultat:</td><td className="text-right tabular-nums">{kr(result)} kr</td></tr>
          <tr className="font-medium"><td>Summa:</td><td className="text-right tabular-nums">{kr(balanserat + result)} kr</td></tr>
        </tbody></table>
        <p className="mt-4 text-sm">Styrelsen föreslår att vinstmedlen disponeras enligt följande:</p>
        <table className="mt-2 w-80 text-sm"><tbody>
          {dividend > 0 && <tr><td>Utdelning till aktieägare:</td><td className="text-right tabular-nums">{kr(dividend)} kr</td></tr>}
          <tr><td>I ny räkning överförs:</td><td className="text-right tabular-nums">{kr(balanserat + result - dividend)} kr</td></tr>
          <tr className="font-medium"><td>Summa:</td><td className="text-right tabular-nums">{kr(balanserat + result)} kr</td></tr>
        </tbody></table>
        {dividend > balanserat + result && <p className="mt-2 text-sm text-red-700 print:hidden">Utdelningen är större än fritt eget kapital.</p>}
      </Page>

      <Page company={company} draft={!year.closed_at} n={4}>
        <Statement title="Resultaträkning" lines={RR} cur={cur} prev={prevFull} y={y} py={py} />
      </Page>

      <Page company={company} draft={!year.closed_at} n={5}>
        <div className="space-y-8">
          <Statement title="Balansräkning" lines={BR} cur={cur} prev={prevBR} y={y} py={py} />
          <Statement title="EGET KAPITAL OCH SKULDER" lines={EK} cur={cur} prev={prevBR} y={y} py={py} extraHead />
        </div>
      </Page>

      <Page company={company} draft={!year.closed_at} n={6}>
        <h1 className="mb-6 text-2xl font-semibold">Noter</h1>
        <h2 className="font-semibold">Not 1 Redovisnings- och värderingsprinciper</h2>
        <p className="mt-2 text-sm">Årsredovisningen är upprättad i enlighet med årsredovisningslagen och BFNAR 2016:10 Årsredovisning i mindre företag.</p>
        <h2 className="mt-8 font-semibold">Not 2 Medelantalet anställda</h2>
        <table className="mt-2 w-full text-sm"><tbody>
          <tr><td></td><td className="w-32 text-right">{y}-12-31</td><td className="w-32 text-right">{py}-12-31</td></tr>
          <tr><td>Medelanställda</td><td className="text-right">{company.employees}</td><td className="text-right"></td></tr>
        </tbody></table>
        <p className="mt-16 text-sm">{city} {stamma || "____________"}</p>
        <div className="mt-14 flex flex-wrap gap-16 text-sm">
          {(board.length ? board : ["", ""]).map((n, i) => <div key={i}>__________________<br />{n}</div>)}
        </div>
      </Page>
    </div>
  );
}
