"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q } from "@/lib/db";
import { COOKIE } from "@/lib/company";

const clean = (fd: FormData) => ({
  name: String(fd.get("name") ?? "").trim(),
  org_nr: String(fd.get("org_nr") ?? "").replace(/\s/g, ""),
  vat_method: String(fd.get("vat_method")) === "bokslut" ? "bokslut" : "faktura",
  vat_period: ["manad", "kvartal", "ar"].includes(String(fd.get("vat_period"))) ? String(fd.get("vat_period")) : "kvartal",
  description: String(fd.get("description") ?? "").trim(),
  seat: String(fd.get("seat") ?? "").trim(),
  board: String(fd.get("board") ?? "").split("\n").map((s) => s.trim()).filter(Boolean).join("\n"),
  employees: Math.max(0, Math.round(Number(fd.get("employees")) || 0)),
});

export async function saveCompany(fd: FormData) {
  const c = clean(fd);
  if (!c.name) return;
  if (c.org_nr && !/^\d{6}-?\d{4}$/.test(c.org_nr)) return;
  const id = Number(fd.get("id"));
  if (id) {
    await q("UPDATE companies SET name = $2, org_nr = $3, vat_method = $4, vat_period = $5, description = $6, seat = $7, board = $8, employees = $9 WHERE id = $1",
      [id, c.name, c.org_nr, c.vat_method, c.vat_period, c.description, c.seat, c.board, c.employees]);
    revalidatePath("/", "layout");
    return;
  }
  const [{ id: newId }] = await q<{ id: number }>(
    "INSERT INTO companies (name, org_nr, vat_method, vat_period, description, seat, board, employees) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
    [c.name, c.org_nr, c.vat_method, c.vat_period, c.description, c.seat, c.board, c.employees]);
  (await cookies()).set(COOKIE, String(newId), { path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/");
}

export async function switchCompany(fd: FormData) {
  (await cookies()).set(COOKIE, String(Number(fd.get("id"))), { path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/");
}
