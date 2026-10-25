"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PoolClient } from "pg";
import { pool, tx } from "@/lib/db";
import { requireCompany } from "@/lib/company";
import { getOrCreateYear, voucherLines } from "@/lib/ledger";
import { parseAmount, round2 } from "@/lib/money";

export type LineInput = { account: string; debit: string; credit: string; description: string };
export type ActionState = { error?: string };

const STORAGE = path.join(process.cwd(), "storage");
const MAX_FILE = 20 * 1024 * 1024;

export async function insertVoucher(v: {
  companyId: number; date: string; description: string; reverses: number | null; opening?: boolean;
  lines: { account: number; debit: number; credit: number; description: string | null }[];
  files: File[];
}, client?: PoolClient): Promise<number> {
  const run = async (c: PoolClient) => {
    const year = await getOrCreateYear(c, v.companyId, v.date);
    if (year.closed_at) throw new Error(`Räkenskapsåret ${year.start_date.slice(0, 4)} är stängt. Bokför på ett öppet år.`);
    // Lås året så att numreringen blir obruten även vid samtidiga anrop
    await c.query("SELECT 1 FROM fiscal_years WHERE id = $1 FOR UPDATE", [year.id]);
    const { rows: [{ next }] } = await c.query("SELECT coalesce(max(number), 0) + 1 AS next FROM vouchers WHERE fiscal_year_id = $1", [year.id]);
    const { rows: [{ id }] } = await c.query(
      "INSERT INTO vouchers (fiscal_year_id, number, date, description, reverses, opening) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [year.id, next, v.date, v.description, v.reverses, v.opening ?? false]);
    for (const l of v.lines)
      await c.query("INSERT INTO voucher_lines (voucher_id, account, debit, credit, description) VALUES ($1,$2,$3,$4,$5)",
        [id, l.account, l.debit, l.credit, l.description]);
    const dir = path.join(STORAGE, String(id));
    if (v.files.length) await mkdir(dir, { recursive: true });
    for (const [i, f] of v.files.entries()) {
      const safe = `${i + 1}-${f.name.replace(/[^\w.åäöÅÄÖ-]+/g, "_")}`;
      await writeFile(path.join(dir, safe), Buffer.from(await f.arrayBuffer()));
      await c.query("INSERT INTO attachments (voucher_id, filename, mime, path) VALUES ($1,$2,$3,$4)",
        [id, f.name, f.type || "application/octet-stream", path.join(String(id), safe)]);
    }
    return id as number;
  };
  return client ? run(client) : tx(run);
}

export async function createVoucher(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const date = String(fd.get("date") ?? "");
  const description = String(fd.get("description") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) return { error: "Ogiltigt datum." };
  if (!description) return { error: "Beskrivning saknas." };

  let raw: LineInput[];
  try { raw = JSON.parse(String(fd.get("lines"))); } catch { return { error: "Ogiltiga rader." }; }
  const lines = raw
    .filter((l) => l.account.trim() || l.debit.trim() || l.credit.trim())
    .map((l) => ({ account: Number(l.account.trim().slice(0, 4)), debit: parseAmount(l.debit), credit: parseAmount(l.credit), description: l.description.trim() || null }));
  if (lines.length < 2) return { error: "Minst två rader krävs." };
  for (const l of lines) {
    if (!(l.account >= 1000 && l.account <= 9999)) return { error: `Ogiltigt konto: ${l.account || "(tomt)"}.` };
    if (isNaN(l.debit) || isNaN(l.credit)) return { error: `Ogiltigt belopp på konto ${l.account}.` };
    if (l.debit > 0 && l.credit > 0) return { error: `Konto ${l.account}: ange antingen debet eller kredit.` };
    if (l.debit === 0 && l.credit === 0) return { error: `Konto ${l.account}: belopp saknas.` };
  }
  const diff = round2(lines.reduce((s, l) => s + l.debit - l.credit, 0));
  if (diff !== 0) return { error: `Verifikationen balanserar inte (differens ${diff}).` };

  const nums = [...new Set(lines.map((l) => l.account))];
  const { rows: known } = await pool.query<{ number: number }>("SELECT number FROM accounts WHERE active AND number = ANY($1)", [nums]);
  const missing = nums.filter((n) => !known.some((k) => k.number === n));
  if (missing.length) return { error: `Okänt eller inaktivt konto: ${missing.join(", ")}. Lägg till det under Konton.` };

  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.some((f) => f.size > MAX_FILE)) return { error: "Bilaga större än 20 MB." };

  const company = await requireCompany();
  let id: number;
  try { id = await insertVoucher({ companyId: company.id, date, description, reverses: null, lines, files }); }
  catch (e) { return { error: (e as Error).message }; }
  revalidatePath("/");
  redirect(`/verifikationer/${id}`);
}

/** Rättelse enligt BFL: ny verifikation med alla rader vända, daterad idag. */
export async function reverseVoucher(fd: FormData) {
  const id = Number(fd.get("id"));
  const { rows: [orig] } = await pool.query<{ number: number; description: string; reversed: boolean; company_id: number }>(
    `SELECT v.number, v.description, fy.company_id, EXISTS (SELECT 1 FROM vouchers r WHERE r.reverses = v.id) AS reversed
       FROM vouchers v JOIN fiscal_years fy ON fy.id = v.fiscal_year_id WHERE v.id = $1`, [id]);
  if (!orig) throw new Error("Verifikationen finns inte.");
  if (orig.reversed) throw new Error("Redan rättad.");
  const lines = (await voucherLines(id)).map((l) => ({ account: l.account, debit: l.credit, credit: l.debit, description: l.description }));
  let newId: number;
  try {
    newId = await insertVoucher({
      companyId: orig.company_id,
      date: new Date().toISOString().slice(0, 10),
      description: `Rättelse av A${orig.number}: ${orig.description}`,
      reverses: id, lines, files: [],
    });
  } catch (e) { throw new Error((e as Error).message); }
  revalidatePath("/");
  redirect(`/verifikationer/${newId}`);
}
