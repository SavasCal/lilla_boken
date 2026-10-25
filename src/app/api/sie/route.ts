import { q } from "@/lib/db";
import { currentCompany } from "@/lib/company";
import { balances, pickYear, voucherLines, vouchersInYear } from "@/lib/ledger";
import { buildSie, toCp437 } from "@/lib/sie";

export async function GET(req: Request) {
  const ar = new URL(req.url).searchParams.get("ar") ?? undefined;
  const company = await currentCompany();
  if (!company) return new Response("Inget företag", { status: 404 });
  const year = await pickYear(company.id, ar);
  const [bal, vs] = await Promise.all([balances(company.id, year.start_date, year.end_date), vouchersInYear(year.id)]);
  const vouchers = await Promise.all(vs.reverse().map(async (v) => ({ ...v, lines: await voucherLines(v.id) })));
  const accounts = await q<{ number: number; name: string }>("SELECT number, name FROM accounts WHERE number = ANY($1) ORDER BY number", [bal.map((b) => b.account)]);
  const text = buildSie({ company: company.name, orgnr: company.org_nr, year, accounts, balances: bal, vouchers });
  const y = year.start_date.slice(0, 4);
  return new Response(Buffer.from(toCp437(text)), {
    headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${company.name.replace(/[^\w-]+/g, "_")}_${y}.se"` },
  });
}
