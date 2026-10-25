// yarn check — kör mot databasen i DATABASE_URL, städar efter sig.
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { toCp437, buildSie } from "../src/lib/sie.ts";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const company = (await db.query("INSERT INTO companies (name) VALUES ('__test__') RETURNING id")).rows[0].id;
const fy = (await db.query("INSERT INTO fiscal_years (company_id, start_date, end_date) VALUES ($1, '2026-01-01', '2026-12-31') RETURNING id", [company])).rows[0].id;

const tryVoucher = async (lines: [number, number, number][]) => {
  await db.query("BEGIN");
  try {
    const { rows: [{ id }] } = await db.query(
      "INSERT INTO vouchers (fiscal_year_id, number, date, description) VALUES ($1, 999999, '2026-01-01', 'test') RETURNING id", [fy]);
    for (const [a, d, c] of lines) await db.query("INSERT INTO voucher_lines (voucher_id, account, debit, credit) VALUES ($1,$2,$3,$4)", [id, a, d, c]);
    await db.query("COMMIT");
    return null;
  } catch (e) { await db.query("ROLLBACK"); return (e as Error).message; }
};

test("obalanserad verifikation avvisas vid commit", async () => {
  assert.match((await tryVoucher([[1930, 100, 0], [2081, 0, 90]])) ?? "", /balanserar inte/);
});
test("verifikation med en rad avvisas", async () => {
  assert.match((await tryVoucher([[1930, 100, 0]])) ?? "", /balanserar inte/);
});
test("bokförd verifikation kan inte ändras eller raderas", async () => {
  assert.equal(await tryVoucher([[1930, 100, 0], [2081, 0, 100]]), null);
  await assert.rejects(db.query("UPDATE vouchers SET description = 'x' WHERE number = 999999"), /inte ändras/);
  await assert.rejects(db.query("DELETE FROM voucher_lines WHERE voucher_id IN (SELECT id FROM vouchers WHERE number = 999999)"), /inte ändras/);
  // städa via att tillfälligt stänga av triggern (superuser lokalt)
  await db.query("ALTER TABLE voucher_lines DISABLE TRIGGER voucher_lines_immutable; ALTER TABLE vouchers DISABLE TRIGGER vouchers_immutable");
  await db.query("DELETE FROM voucher_lines WHERE voucher_id IN (SELECT id FROM vouchers WHERE number = 999999); DELETE FROM vouchers WHERE number = 999999");
  await db.query("ALTER TABLE voucher_lines ENABLE TRIGGER voucher_lines_immutable; ALTER TABLE vouchers ENABLE TRIGGER vouchers_immutable");
});
test("SIE kodas som CP437 och innehåller ver/trans", () => {
  const b = toCp437("Företagskonto å");
  assert.equal(b[1], 0x94); assert.equal(b[b.length - 1], 0x86);
  const s = buildSie({ company: "Test AB", orgnr: "", year: { start_date: "2026-01-01", end_date: "2026-12-31" },
    accounts: [{ number: 1930, name: "Företagskonto" }], balances: [{ account: 1930, name: "Företagskonto", debit: 100, credit: 0 }],
    vouchers: [{ id: 1, number: 1, date: "2026-01-05", description: "Insättning", reverses: null, opening: false, created_at: new Date(), fiscal_year_id: 1,
      lines: [{ id: 1, account: 1930, name: "", debit: 100, credit: 0, description: null }, { id: 2, account: 2081, name: "", debit: 0, credit: 100, description: null }] }] });
  assert.match(s, /#VER "A" 1 20260105 "Insättning"\r\n\{\r\n   #TRANS 1930 \{\} 100\.00\r\n   #TRANS 2081 \{\} -100\.00\r\n\}/);
  assert.match(s, /#UB 0 1930 100\.00/);
});
test.after(async () => {
  await db.query("DELETE FROM fiscal_years WHERE company_id = $1", [company]);
  await db.query("DELETE FROM companies WHERE id = $1", [company]);
  await db.end();
});
