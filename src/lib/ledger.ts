import { q } from "./db";
import type { PoolClient } from "pg";

export type FiscalYear = { id: number; company_id: number; start_date: string; end_date: string; closed_at: Date | null };
export type Voucher = { id: number; number: number; date: string; description: string; reverses: number | null; opening: boolean; created_at: Date; fiscal_year_id: number };
export type VoucherRow = Voucher & { total: number; reversed_by: number | null; reversed_by_number: number | null; reverses_number: number | null; attachments: number };
export type VoucherLine = { id: number; account: number; name: string; debit: number; credit: number; description: string | null };
export type Account = { number: number; name: string; active: boolean };
export type Balance = { account: number; name: string; debit: number; credit: number };

export const fiscalYears = (companyId: number) =>
  q<FiscalYear>("SELECT * FROM fiscal_years WHERE company_id = $1 ORDER BY start_date DESC", [companyId]);

/** Räkenskapsår för ?ar=YYYY, annars innevarande/senaste. Innevarande kalenderår skapas om företaget saknar år. */
export async function pickYear(companyId: number, ar?: string): Promise<FiscalYear> {
  const today = new Date().toISOString().slice(0, 10);
  let years = await fiscalYears(companyId);
  if (years.length === 0) {
    await q("INSERT INTO fiscal_years (company_id, start_date, end_date) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [companyId, `${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`]);
    years = await fiscalYears(companyId);
  }
  return years.find((y) => y.start_date.startsWith(ar ?? "\0")) ?? years.find((y) => y.start_date <= today && today <= y.end_date) ?? years[0];
}

/** Kalenderår skapas automatiskt första gången ett datum i det används. */
export async function getOrCreateYear(c: PoolClient, companyId: number, date: string): Promise<FiscalYear> {
  const found = (await c.query<FiscalYear>(
    "SELECT * FROM fiscal_years WHERE company_id = $1 AND $2 BETWEEN start_date AND end_date", [companyId, date])).rows[0];
  if (found) return found;
  const y = date.slice(0, 4);
  return (await c.query<FiscalYear>(
    "INSERT INTO fiscal_years (company_id, start_date, end_date) VALUES ($1, $2, $3) RETURNING *",
    [companyId, `${y}-01-01`, `${y}-12-31`])).rows[0];
}

export const activeAccounts = () => q<Account>("SELECT * FROM accounts WHERE active ORDER BY number");

export const vouchersInYear = (fyId: number) =>
  q<VoucherRow>(
    `SELECT v.*, (SELECT sum(debit) FROM voucher_lines l WHERE l.voucher_id = v.id) AS total,
            r.id AS reversed_by, r.number AS reversed_by_number, o.number AS reverses_number,
            (SELECT count(*)::int FROM attachments a WHERE a.voucher_id = v.id) AS attachments
       FROM vouchers v LEFT JOIN vouchers r ON r.reverses = v.id LEFT JOIN vouchers o ON o.id = v.reverses
      WHERE v.fiscal_year_id = $1 ORDER BY v.number DESC`, [fyId]);

/** Kvittokopia krävs för allt utom IB och rättelser (rättelsen hänvisar till originalets underlag). */
export const needsReceipt = (v: VoucherRow) => v.attachments === 0 && !v.opening && !v.reverses && !v.reversed_by;

export const voucherLines =(voucherId: number) =>
  q<VoucherLine>(`SELECT l.id, l.account, a.name, l.debit, l.credit, l.description
                    FROM voucher_lines l JOIN accounts a ON a.number = l.account
                   WHERE l.voucher_id = $1 ORDER BY l.id`, [voucherId]);

/** Saldo per konto inom ett datumintervall (inkl.). */
export const balances = (companyId: number, from: string, to: string) =>
  q<Balance>(`SELECT l.account, a.name, sum(l.debit)::numeric(14,2) AS debit, sum(l.credit)::numeric(14,2) AS credit
                FROM voucher_lines l JOIN vouchers v ON v.id = l.voucher_id JOIN fiscal_years fy ON fy.id = v.fiscal_year_id
                JOIN accounts a ON a.number = l.account
               WHERE fy.company_id = $1 AND v.date BETWEEN $2 AND $3 GROUP BY l.account, a.name ORDER BY l.account`, [companyId, from, to]);

/** Årets resultat = klass 3–8 (kredit − debet), exkl. 8999 som bara används för resultatomföringen vid bokslut. */
export const resultOf = (b: Balance[]) =>
  b.filter((r) => r.account >= 3000 && r.account !== 8999).reduce((s, r) => s + r.credit - r.debit, 0);
/** Resultat som ännu inte förts över till eget kapital (0 när bokslutets 8999-omföring finns). */
export const unbookedResult = (b: Balance[]) => (b.some((r) => r.account === 8999) ? 0 : resultOf(b));
export const netOf = (b: Balance[], lo: number, hi: number, sign: 1 | -1 = 1) =>
  b.filter((r) => r.account >= lo && r.account <= hi).reduce((s, r) => s + sign * (r.debit - r.credit), 0);
