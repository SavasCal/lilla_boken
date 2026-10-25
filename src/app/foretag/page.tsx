import { companies, currentCompany, VAT_METHODS, VAT_PERIODS, type Company } from "@/lib/company";
import { saveCompany, switchCompany } from "./actions";

export const dynamic = "force-dynamic";

function CompanyForm({ c }: { c?: Company }) {
  return (
    <form action={saveCompany} className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-3 text-sm">
      {c && <input type="hidden" name="id" value={c.id} />}
      <label>Företagsnamn<br /><input name="name" defaultValue={c?.name} required className="w-full" placeholder="Mitt AB" /></label>
      <label>Organisationsnummer<br /><input name="org_nr" defaultValue={c?.org_nr} className="w-40" placeholder="556xxx-xxxx" pattern="\d{6}-?\d{4}" /></label>
      <label>Momsmetod<br />
        <select name="vat_method" defaultValue={c?.vat_method ?? "faktura"} className="w-full">
          {VAT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label>Momsredovisning<br />
        <select name="vat_period" defaultValue={c?.vat_period ?? "kvartal"}>
          {VAT_PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <p className="col-span-2 mt-2 text-xs font-medium uppercase tracking-wide text-stone-500">Till årsredovisningen</p>
      <label className="col-span-2">Allmänt om verksamheten<br /><textarea name="description" defaultValue={c?.description} rows={2} className="w-full rounded border border-stone-300 p-2" placeholder="Aktiebolaget har för avsikt att …" /></label>
      <label>Säte<br /><input name="seat" defaultValue={c?.seat} className="w-full" placeholder="Stockholm, Stockholm län" /></label>
      <label>Medelantal anställda<br /><input name="employees" type="number" min={0} defaultValue={c?.employees ?? 0} className="w-24" /></label>
      <label className="col-span-2">Styrelse, en per rad (första undertecknar fastställelseintyget)<br /><textarea name="board" defaultValue={c?.board} rows={2} className="w-full rounded border border-stone-300 p-2" /></label>
      <div className="col-span-2"><button className={c ? "btn btn-ghost" : "btn"}>{c ? "Spara" : "Skapa företag"}</button></div>
    </form>
  );
}

export default async function Foretag() {
  const [all, current] = await Promise.all([companies(), currentCompany()]);
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Företag</h1>
      {all.length === 0 && <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Skapa ditt första företag för att börja bokföra.</p>}
      {all.map((c) => (
        <section key={c.id} className={`rounded border bg-white p-5 ${c.id === current?.id ? "border-stone-900" : "border-stone-200"}`}>
          <div className="mb-4 flex items-center gap-3">
            <h2 className="font-semibold">{c.name}</h2>
            {c.id === current?.id ? <span className="rounded bg-stone-900 px-2 py-0.5 text-xs text-white">Aktivt</span> : (
              <form action={switchCompany}><input type="hidden" name="id" value={c.id} /><button className="text-xs underline">Växla till</button></form>
            )}
          </div>
          <CompanyForm c={c} />
        </section>
      ))}
      <section className="rounded border border-dashed border-stone-300 p-5">
        <h2 className="mb-4 font-semibold">Nytt företag</h2>
        <CompanyForm />
      </section>
      <div className="text-xs text-stone-500 space-y-1">
        <p><b>Faktureringsmetoden</b>: moms redovisas när fakturan bokförs. Kundfordringar och leverantörsskulder bokförs löpande (1510/2440). Obligatorisk över 3 Mkr i omsättning.</p>
        <p><b>Bokslutsmetoden</b>: moms redovisas när betalningen sker. Fakturor bokförs först vid betalning, obetalda fakturor bokas upp vid bokslut. Tillåten under 3 Mkr.</p>
        <p>Metoden styr vilka mallar som visas vid ny verifikation. Momsredovisningsperioden styr standardperioden i momsrapporten.</p>
      </div>
    </div>
  );
}
