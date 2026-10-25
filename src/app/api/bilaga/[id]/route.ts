import { readFile } from "node:fs/promises";
import path from "node:path";
import { q } from "@/lib/db";
import { currentCompany } from "@/lib/company";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await currentCompany();
  const [a] = await q<{ filename: string; mime: string; path: string }>(
    `SELECT a.filename, a.mime, a.path FROM attachments a JOIN vouchers v ON v.id = a.voucher_id JOIN fiscal_years fy ON fy.id = v.fiscal_year_id
      WHERE a.id = $1 AND fy.company_id = $2`, [Number(id) || 0, company?.id ?? 0]);
  if (!a) return new Response("Not found", { status: 404 });
  const buf = await readFile(path.join(process.cwd(), "storage", a.path));
  return new Response(buf, { headers: { "Content-Type": a.mime, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.filename)}` } });
}
