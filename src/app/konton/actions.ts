"use server";

import { revalidatePath } from "next/cache";
import { q } from "@/lib/db";

export async function addAccount(fd: FormData) {
  const number = Number(fd.get("number")), name = String(fd.get("name") ?? "").trim();
  if (!(number >= 1000 && number <= 9999) || !name) return;
  await q("INSERT INTO accounts (number, name) VALUES ($1, $2) ON CONFLICT (number) DO UPDATE SET name = EXCLUDED.name, active = true", [number, name]);
  revalidatePath("/konton");
}

export async function toggleAccount(fd: FormData) {
  await q("UPDATE accounts SET active = NOT active WHERE number = $1", [Number(fd.get("number"))]);
  revalidatePath("/konton");
}
