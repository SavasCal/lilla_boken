"use client";

import { useActionState, useMemo, useState } from "react";
import { templatesFor, type Line, type VatMethod } from "@/lib/templates";
import { fmt0, parseAmount, round2 } from "@/lib/money";
import { createVoucher, type ActionState } from "../actions";

const today = () => new Date().toISOString().slice(0, 10);
const empty = (): Line => ({ account: "", debit: "", credit: "", description: "" });

export function VoucherForm({ accounts, vatMethod, initialTemplate }: { accounts: [number, string][]; vatMethod: VatMethod; initialTemplate?: string }) {
  const TEMPLATES = templatesFor(vatMethod);
  const [state, action, pending] = useActionState<ActionState, FormData>(createVoucher, {});
  const [tplId, setTplId] = useState(TEMPLATES.some((t) => t.id === initialTemplate) ? initialTemplate! : "tom");
  const [gross, setGross] = useState("");
  const [acct, setAcct] = useState("");
  const [lines, setLines] = useState<Line[]>([empty(), empty()]);
  const names = useMemo(() => new Map(accounts), [accounts]);
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;

  const apply = () => {
    const g = parseAmount(gross);
    if (!g) return;
    setLines(tpl.build(g, acct || tpl.pickAccount?.def || ""));
  };
  const set = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const sum = (k: "debit" | "credit") => round2(lines.reduce((s, l) => s + (parseAmount(l[k]) || 0), 0));
  const diff = round2(sum("debit") - sum("credit"));
  const nameOf = (v: string) => names.get(Number(v.trim().slice(0, 4))) ?? "";

  return (
    <form action={action} className="space-y-6">
      <fieldset className="rounded border border-stone-200 bg-white p-4">
        <legend className="px-1 text-sm font-medium">Mall</legend>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Typ<br />
            <select value={tplId} onChange={(e) => setTplId(e.target.value)}>
              {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          {tplId !== "tom" && (
            <label className="text-sm">Belopp inkl. moms<br /><input value={gross} onChange={(e) => setGross(e.target.value)} inputMode="decimal" placeholder="0,00" /></label>
          )}
          {tpl.pickAccount && (
            <label className="text-sm">{tpl.pickAccount.label}<br />
              <input list="konton" value={acct} placeholder={tpl.pickAccount.def} onChange={(e) => setAcct(e.target.value)} className="w-56" />
            </label>
          )}
          {tplId !== "tom" && <button type="button" className="btn btn-ghost" onClick={apply}>Fyll i rader</button>}
        </div>
      </fieldset>

      <div className="flex gap-4">
        <label className="text-sm">Datum<br /><input type="date" name="date" defaultValue={today()} required /></label>
        <label className="grow text-sm">Beskrivning<br /><input name="description" required className="w-full" placeholder="T.ex. Faktura 1234 från Leverantören AB" /></label>
      </div>

      <table className="ledger">
        <thead><tr><th className="w-56">Konto</th><th>Kontonamn</th><th className="num w-36">Debet</th><th className="num w-36">Kredit</th><th>Radtext</th><th></th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td><input list="konton" value={l.account} onChange={(e) => set(i, "account", e.target.value.slice(0, 4))} className="w-full" /></td>
              <td className="text-stone-600">{nameOf(l.account)}</td>
              <td><input value={l.debit} onChange={(e) => set(i, "debit", e.target.value)} inputMode="decimal" className="w-full text-right" /></td>
              <td><input value={l.credit} onChange={(e) => set(i, "credit", e.target.value)} inputMode="decimal" className="w-full text-right" /></td>
              <td><input value={l.description} onChange={(e) => set(i, "description", e.target.value)} className="w-full" /></td>
              <td><button type="button" className="text-stone-400 hover:text-red-600" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Ta bort rad">×</button></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium">
            <td colSpan={2}><button type="button" className="text-sm underline" onClick={() => setLines((ls) => [...ls, empty()])}>+ Rad</button></td>
            <td className="num">{fmt0(sum("debit"))}</td>
            <td className="num">{fmt0(sum("credit"))}</td>
            <td colSpan={2} className={diff === 0 ? "text-green-700" : "text-red-700"}>{diff === 0 ? "Balanserar" : `Differens ${fmt0(diff)}`}</td>
          </tr>
        </tfoot>
      </table>
      <datalist id="konton">{accounts.map(([n, name]) => <option key={n} value={n}>{name}</option>)}</datalist>
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

      <label className="block text-sm">Bilagor (kvitto, faktura)<br /><input type="file" name="files" multiple accept=".pdf,image/*" /></label>

      {state.error && <p className="rounded bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
      <button className="btn" disabled={pending || diff !== 0 || lines.length < 2}>{pending ? "Sparar…" : "Bokför"}</button>
    </form>
  );
}
