import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { q } from "./db";
import type { VatMethod } from "./templates";

export type Company = { id: number; name: string; org_nr: string; vat_method: VatMethod; vat_period: "manad" | "kvartal" | "ar";
  /** Årsredovisning: verksamhetsbeskrivning, säte (t.ex. "Stockholm, Stockholm län"), styrelse en per rad, medelantal anställda */
  description: string; seat: string; board: string; employees: number };
export const COOKIE = "company";

export const companies = () => q<Company>("SELECT * FROM companies ORDER BY id");

/** Valt företag (cookie), annars det första. null om inga företag finns. */
export async function currentCompany(): Promise<Company | null> {
  const all = await companies();
  const id = Number((await cookies()).get(COOKIE)?.value);
  return all.find((c) => c.id === id) ?? all[0] ?? null;
}

export async function requireCompany(): Promise<Company> {
  const c = await currentCompany();
  if (!c) redirect("/foretag");
  return c;
}

export const VAT_METHODS: [VatMethod, string][] = [["faktura", "Faktureringsmetoden"], ["bokslut", "Bokslutsmetoden (kontantmetoden)"]];
export const VAT_PERIODS: [Company["vat_period"], string][] = [["manad", "Varje månad"], ["kvartal", "Varje kvartal"], ["ar", "En gång per år"]];
