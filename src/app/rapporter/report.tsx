import Link from "next/link";
import type { Balance } from "@/lib/ledger";
import { fmt0 } from "@/lib/money";

/** Grupperad rapporttabell. sign: +1 visar debet−kredit, −1 visar kredit−debet. */
export function Group({ title, rows, sign, year }: { title: string; rows: Balance[]; sign: 1 | -1; year: string }) {
  const total = rows.reduce((s, r) => s + sign * (r.debit - r.credit), 0);
  return (
    <>
      <tr className="bg-stone-100 font-semibold"><td colSpan={2}>{title}</td><td className="num">{fmt0(total)}</td></tr>
      {rows.map((r) => (
        <tr key={r.account}><td className="w-20"><Link className="underline" href={`/huvudbok?ar=${year}&konto=${r.account}`}>{r.account}</Link></td><td>{r.name}</td><td className="num">{fmt0(sign * (r.debit - r.credit))}</td></tr>
      ))}
    </>
  );
}
export const inRange = (b: Balance[], lo: number, hi: number) => b.filter((r) => r.account >= lo && r.account <= hi);
