"use client";

import { useActionState } from "react";
import { closeYear, type CloseState } from "./actions";

export function CloseForm({ fiscalYearId, year }: { fiscalYearId: number; year: string }) {
  const [state, action, pending] = useActionState<CloseState, FormData>(closeYear, {});
  return (
    <form action={action} className="space-y-3 rounded border border-stone-900 bg-white p-5">
      <input type="hidden" name="fiscal_year_id" value={fiscalYearId} />
      <input type="hidden" name="ar" value={year} />
      <h2 className="font-semibold">Stäng räkenskapsåret {year}</h2>
      <p className="text-sm text-stone-600">
        Detta bokför årets resultat (8999 mot 2099), skapar ingående balanser för {Number(year) + 1} och låser {year}. Går inte att ångra.
      </p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" /> Alla bokslutsposter är bokförda och rapporterna är kontrollerade</label>
      {state.error && <p className="rounded bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Stänger…" : `Stäng ${year} och skapa IB för ${Number(year) + 1}`}</button>
    </form>
  );
}
