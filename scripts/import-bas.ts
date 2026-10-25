// Engångsskript: BAS 2026 XLSX -> db/bas2026.json. Kör: yarn bas:import [path-to-xlsx]
import * as X from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2] ?? "https://www.bas.se/wp-content/uploads/2026/04/BAS_kontoplan_2026_v2.xlsx";
const buf = src.startsWith("http") ? Buffer.from(await (await fetch(src)).arrayBuffer()) : readFileSync(src);
const wb = X.read(buf);
const rows: unknown[][] = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

const clean = (s: unknown) => String(s).replace(/\s*\r?\n\s*/g, " ").trim();
const accounts: { number: number; name: string; k2: boolean }[] = [];
for (const r of rows) {
  for (const [n, name] of [[r[0], r[1]], [r[2], r[3]]]) {
    const m = /^(\d{4})(#?)$/.exec(String(n ?? ""));
    if (m && name) accounts.push({ number: +m[1], name: clean(name), k2: m[2] === "" });
  }
}
accounts.sort((a, b) => a.number - b.number);
writeFileSync("db/bas2026.json", JSON.stringify(accounts, null, 0) + "\n");
console.log(accounts.length, "konton");
