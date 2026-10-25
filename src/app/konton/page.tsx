import { q } from "@/lib/db";
import type { Account } from "@/lib/ledger";
import { addAccount, toggleAccount } from "./actions";

export const dynamic = "force-dynamic";

export default async function Konton({ searchParams }: { searchParams: Promise<{ q?: string; alla?: string }> }) {
  const { q: term = "", alla } = await searchParams;
  const accounts = await q<Account>(
    `SELECT * FROM accounts WHERE ($1 = '' OR number::text LIKE $1 || '%' OR name ILIKE '%' || $1 || '%') AND (active OR $2) ORDER BY number`,
    [term.trim(), alla === "1"]);
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Kontoplan <span className="text-base font-normal text-stone-500">BAS 2026</span></h1>
      <div className="mb-4 flex flex-wrap gap-6 text-sm">
        <form className="flex items-end gap-2">
          <label>Sök<br /><input name="q" defaultValue={term} placeholder="1930 eller Företagskonto" /></label>
          <label className="pb-2"><input type="checkbox" name="alla" value="1" defaultChecked={alla === "1"} /> visa inaktiva</label>
          <button className="btn btn-ghost">Sök</button>
        </form>
        <form action={addAccount} className="flex items-end gap-2">
          <label>Nytt konto<br /><input name="number" inputMode="numeric" pattern="[1-9][0-9]{3}" required className="w-20" placeholder="4011" /></label>
          <label>Namn<br /><input name="name" required className="w-64" /></label>
          <button className="btn btn-ghost">Lägg till</button>
        </form>
      </div>
      <table className="ledger">
        <thead><tr><th>Konto</th><th>Namn</th><th></th></tr></thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.number} className={a.active ? "" : "text-stone-400"}>
              <td>{a.number}</td><td>{a.name}</td>
              <td className="text-right"><form action={toggleAccount}><input type="hidden" name="number" value={a.number} /><button className="text-xs underline">{a.active ? "Inaktivera" : "Aktivera"}</button></form></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
