import Link from "next/link";
import { requireCompany } from "@/lib/company";
import { balances, fiscalYears, needsReceipt, pickYear, resultOf, vouchersInYear } from "@/lib/ledger";
import { fmt0, fmtTs } from "@/lib/money";
import { YearSelect } from "../year-select";
import { CloseForm } from "./close-form";

export const dynamic = "force-dynamic";

const STEPS: [string, string, string][] = [
  ["Avskrivningar på inventarier och andra anläggningstillgångar", "avskr", "7832 / 1229"],
  ["Upplupna kostnader (fakturor som avser året men kommer efter årsskiftet)", "upplupen", "kostnad / 2990"],
  ["Förutbetalda kostnader (betalt i år, avser nästa år, t.ex. hyra och försäkring)", "forutbet", "1790 / kostnad"],
  ["Upplupna intäkter och förutbetalda intäkter vid behov", "tom", "1790 resp. 2990"],
  ["Momsredovisning för sista perioden omförd till 2650", "tom", "2610, 2640 / 2650"],
  ["Stäm av bankkonto 1930 mot kontoutdraget och kundfordringar/leverantörsskulder mot reskontra", "", ""],
  ["Årets bolagsskatt (20,6 % av skattemässigt resultat)", "skatt", "8910 / 2510"],
];

export default async function Bokslut({ searchParams }: { searchParams: Promise<{ ar?: string }> }) {
  const { ar } = await searchParams;
  const company = await requireCompany();
  const [years, year] = await Promise.all([fiscalYears(company.id), pickYear(company.id, ar)]);
  const y = year.start_date.slice(0, 4);
  const [bal, vouchers] = await Promise.all([balances(company.id, year.start_date, year.end_date), vouchersInYear(year.id)]);
  const result = resultOf(bal);
  const closingVouchers = vouchers.filter((v) => v.description.startsWith("Årets resultat"));
  const nextYear = years.find((f) => f.start_date.startsWith(String(Number(y) + 1)));
  const openPrev = years.find((f) => f.end_date < year.start_date && !f.closed_at);
  const missing = vouchers.filter(needsReceipt).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold">Bokslut {y}</h1>
        <YearSelect years={years} current={year} />
        {year.closed_at
          ? <span className="rounded bg-stone-900 px-2 py-0.5 text-xs text-white">Stängt {fmtTs(year.closed_at)}</span>
          : <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Öppet</span>}
        <Link href={`/bokslut/arsredovisning?ar=${y}`} className="btn ml-auto">{year.closed_at ? "Årsredovisning" : "Demo: årsredovisning hittills"}</Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[["Verifikationer", String(vouchers.length)], ["Preliminärt resultat", fmt0(result)], ["Eget kapital 20xx", fmt0(bal.filter((b) => b.account >= 2000 && b.account < 2100).reduce((s, b) => s + b.credit - b.debit, 0))]].map(([l, v]) => (
          <div key={l} className="rounded border border-stone-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-stone-500">{l}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      {year.closed_at ? (
        <section className="space-y-2 text-sm">
          <p>Året är stängt. {closingVouchers.length > 0 ? <>Resultatomföring: {closingVouchers.map((v) => <Link key={v.id} className="underline" href={`/verifikationer/${v.id}`}>A{v.number}</Link>)}.</> : "Inget resultat att omföra."}
            {nextYear && <> Ingående balanser finns i <Link className="underline" href={`/verifikationer?ar=${nextYear.start_date.slice(0, 4)}`}>grundboken {nextYear.start_date.slice(0, 4)}</Link>.</>}
          </p>
          <p className="text-stone-600">Efter årsstämman: boka om årets resultat från 2099 till 2091 Balanserad vinst (eller 2898 Utdelning) i {Number(y) + 1}. Skicka in årsredovisningen till Bolagsverket senast {Number(y) + 1}-07-31.</p>
        </section>
      ) : (
        <>
          <section>
            <h2 className="mb-2 font-semibold">Bokslutsposter att gå igenom</h2>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm">
              {STEPS.map(([text, tpl, konton]) => (
                <li key={text}>{text}{konton && <span className="text-stone-500"> ({konton})</span>}
                  {tpl && <> · <Link className="underline" href={`/verifikationer/ny?mall=${tpl}`}>bokför</Link></>}</li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-stone-600">Kontrollera sedan <Link className="underline" href={`/rapporter/resultat?ar=${y}`}>resultaträkningen</Link> och <Link className="underline" href={`/rapporter/balans?ar=${y}`}>balansräkningen</Link>.</p>
          </section>
          {openPrev
            ? <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Stäng {openPrev.start_date.slice(0, 4)} först så att ingående balanser för {y} blir rätt.</p>
            : missing > 0
              ? <p className="rounded bg-red-50 p-3 text-sm text-red-900">{missing} verifikationer saknar kvittokopia. <Link className="underline" href={`/verifikationer?ar=${y}&saknar=1`}>Komplettera underlagen</Link> innan året kan stängas.</p>
              : <CloseForm fiscalYearId={year.id} year={y} />}
        </>
      )}
    </div>
  );
}
