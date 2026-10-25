// Engångsimport av ett kontoutdrag i md-format (bokforing/kontoutdrag-2026.md) till verifikationer.
// node --env-file=.env.local --no-warnings --experimental-transform-types scripts/import-kontoutdrag.ts <fil.md> --bolag 556xxx-xxxx [--skriv]
// Utan --skriv: kontrollerar saldokedjan och skriver ut verifikationerna, men bokför inget.
// Företaget måste redan finnas (skapas i appen under Företag & inställningar).
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import assert from "node:assert/strict";
import pg from "pg";

const { positionals: [file], values: { bolag, skriv } } = parseArgs({
  allowPositionals: true,
  options: { bolag: { type: "string" }, skriv: { type: "boolean", default: false } },
});
if (!file || !bolag) {
  console.error("Användning: import-kontoutdrag.ts <fil.md> --bolag <org.nr> [--skriv]");
  process.exit(1);
}

const amount = (s: string) => Number(s.replace(/[\s ]/g, "").replace(",", "."));
const r2 = (n: number) => Math.round(n * 100) / 100;

const rows = readFileSync(file, "utf8").split("\n")
  .filter((l) => /^\| \d{4}-\d{2}-\d{2} /.test(l))
  .map((l) => {
    const [date, text, , belopp, saldo, kontering] = l.split("|").slice(1, -1).map((c) => c.trim());
    return { date, text, amount: amount(belopp), saldo: amount(saldo), kontering };
  });

// Saldokedjan: varje rad = föregående saldo + belopp
for (let i = 1; i < rows.length; i++)
  assert.equal(r2(rows[i - 1].saldo + rows[i].amount), rows[i].saldo, `saldo bryts på rad ${i + 1} (${rows[i].date} ${rows[i].text})`);

type Line = { account: number; debit: number; credit: number };
const vouchers = rows.filter((r) => !r.kontering.startsWith("väntar")).map((r) => {
  const m = r.kontering.match(/^(\d{4}) \/ (\d{4})(?: \+ 2610)?$/);
  if (!m) throw new Error(`Okänd kontering "${r.kontering}" (${r.date} ${r.text})`);
  const [, d, c] = m.map(Number), a = Math.abs(r.amount);
  if ((d === 1930) !== (r.amount > 0)) throw new Error(`1930 på fel sida för ${r.date} ${r.text}`);
  const lines: Line[] = r.kontering.endsWith("+ 2610")
    ? [{ account: d, debit: a, credit: 0 }, { account: c, debit: 0, credit: r2(a * 0.8) }, { account: 2610, debit: 0, credit: r2(a - r2(a * 0.8)) }]
    : [{ account: d, debit: a, credit: 0 }, { account: c, debit: 0, credit: a }];
  return { date: r.date, description: `${r.text} (bank)`, lines };
});
const bank = r2(vouchers.flatMap((v) => v.lines).filter((l) => l.account === 1930).reduce((s, l) => s + l.debit - l.credit, 0));
for (const v of vouchers) console.log(v.date, v.description.padEnd(32), v.lines.map((l) => `${l.account} ${l.debit || -l.credit}`).join("  "));
console.log(`\n${vouchers.length} verifikationer, ${rows.length - vouchers.length} väntar. 1930 netto ${bank}.`);

const yr = rows[0]?.date.slice(0, 4);
if (!yr || rows.some((r) => !r.date.startsWith(yr))) throw new Error("Kontoutdraget måste innehålla rader från exakt ett kalenderår.");

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const found = (await db.query<{ id: number; name: string }>("SELECT id, name FROM companies WHERE replace(org_nr, '-', '') = replace($1, '-', '')", [bolag])).rows[0];
  if (!found) throw new Error(`Inget företag med org.nr ${bolag}. Skapa det i appen först.`);
  console.log(`Företag: ${found.name} (id ${found.id}), år ${yr}.`);
  if (!skriv) process.exit(0);
  const company = found.id;
  await db.query("BEGIN");
  // Samma logik som insertVoucher i src/app/verifikationer/actions.ts
  const year = (await db.query("SELECT * FROM fiscal_years WHERE company_id = $1 AND start_date = $2 FOR UPDATE", [company, `${yr}-01-01`])).rows[0]
    ?? (await db.query("INSERT INTO fiscal_years (company_id, start_date, end_date) VALUES ($1, $2, $3) RETURNING *", [company, `${yr}-01-01`, `${yr}-12-31`])).rows[0];
  if (year.closed_at) throw new Error(`Räkenskapsåret ${yr} är stängt.`);
  const dup = (await db.query("SELECT count(*)::int AS n FROM vouchers WHERE fiscal_year_id = $1 AND description LIKE '%(bank)'", [year.id])).rows[0].n;
  if (dup) throw new Error(`Det finns redan ${dup} bankverifikationer i ${yr}, avbryter för att inte dubbelbokföra.`);
  let next = (await db.query("SELECT coalesce(max(number), 0) + 1 AS n FROM vouchers WHERE fiscal_year_id = $1", [year.id])).rows[0].n;
  for (const v of vouchers) {
    const { rows: [{ id }] } = await db.query(
      "INSERT INTO vouchers (fiscal_year_id, number, date, description) VALUES ($1,$2,$3,$4) RETURNING id", [year.id, next++, v.date, v.description]);
    for (const l of v.lines)
      await db.query("INSERT INTO voucher_lines (voucher_id, account, debit, credit) VALUES ($1,$2,$3,$4)", [id, l.account, l.debit, l.credit]);
  }
  await db.query("COMMIT");
  console.log(`Bokfört A${next - vouchers.length}–A${next - 1} på företag ${company}.`);
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
}
