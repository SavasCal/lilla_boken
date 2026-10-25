"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { tx } from "@/lib/db";
import { requireCompany } from "@/lib/company";
import { balances, needsReceipt, resultOf, vouchersInYear, type FiscalYear } from "@/lib/ledger";
import { round2 } from "@/lib/money";
import { insertVoucher } from "../verifikationer/actions";

export type CloseState = { error?: string };

/**
 * Stänger räkenskapsåret:
 * 1. Resultatomföring: 8999 mot 2099 så att RR nollas och resultatet hamnar i eget kapital.
 * 2. Ingående balanser: UB på alla balanskonton bokas som öppningsverifikation i nästa år.
 * 3. Året låses, inga fler verifikationer kan bokföras på det.
 */
export async function closeYear(_prev: CloseState, fd: FormData): Promise<CloseState> {
  const company = await requireCompany();
  const fyId = Number(fd.get("fiscal_year_id"));
  if (fd.get("confirm") !== "on") return { error: "Bekräfta att alla bokslutsposter är bokförda." };
  try {
    await tx(async (c) => {
      const { rows: [year] } = await c.query<FiscalYear>("SELECT * FROM fiscal_years WHERE id = $1 AND company_id = $2 FOR UPDATE", [fyId, company.id]);
      if (!year) throw new Error("Räkenskapsåret finns inte.");
      if (year.closed_at) throw new Error("Räkenskapsåret är redan stängt.");
      const { rows: [prev] } = await c.query<FiscalYear>(
        "SELECT * FROM fiscal_years WHERE company_id = $1 AND end_date < $2 AND closed_at IS NULL LIMIT 1", [company.id, year.start_date]);
      if (prev) throw new Error(`Stäng ${prev.start_date.slice(0, 4)} först.`);
      const missing = (await vouchersInYear(year.id)).filter(needsReceipt);
      if (missing.length) throw new Error(`${missing.length} verifikationer saknar kvittokopia: ${missing.map((v) => `A${v.number}`).reverse().join(", ")}. Ladda upp underlagen innan året stängs.`);

      const result = round2(resultOf(await balances(company.id, year.start_date, year.end_date)));
      if (result !== 0) {
        await insertVoucher({
          companyId: company.id, date: year.end_date, description: `Årets resultat ${year.start_date.slice(0, 4)}`, reverses: null, files: [],
          lines: result > 0
            ? [{ account: 8999, debit: result, credit: 0, description: null }, { account: 2099, debit: 0, credit: result, description: null }]
            : [{ account: 2099, debit: -result, credit: 0, description: null }, { account: 8999, debit: 0, credit: -result, description: null }],
        }, c);
      }
      // UB på balanskonton efter resultatomföringen -> IB nästa år
      const { rows: ub } = await c.query<{ account: number; net: number }>(
        `SELECT l.account, sum(l.debit - l.credit)::numeric(14,2) AS net
           FROM voucher_lines l JOIN vouchers v ON v.id = l.voucher_id
          WHERE v.fiscal_year_id = $1 AND l.account < 3000 GROUP BY l.account HAVING sum(l.debit - l.credit) <> 0 ORDER BY l.account`, [year.id]);
      const next = `${Number(year.start_date.slice(0, 4)) + 1}-01-01`;
      if (ub.length >= 2) {
        await insertVoucher({
          companyId: company.id, date: next, description: `Ingående balanser ${next.slice(0, 4)}`, reverses: null, files: [], opening: true,
          lines: ub.map((r) => ({ account: r.account, debit: r.net > 0 ? r.net : 0, credit: r.net < 0 ? -r.net : 0, description: null })),
        }, c);
      }
      await c.query("UPDATE fiscal_years SET closed_at = now() WHERE id = $1", [year.id]);
    });
  } catch (e) { return { error: (e as Error).message }; }
  revalidatePath("/", "layout");
  redirect(`/bokslut?ar=${fd.get("ar")}`);
}
