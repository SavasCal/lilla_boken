// Skapar databasen, kör schema.sql och seedar BAS 2026. Idempotent.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

const url = new URL(process.env.DATABASE_URL ?? "postgres://localhost:5432/lilla_boken");
const dbName = url.pathname.slice(1);
try { execSync(`createdb ${dbName}`, { stdio: "pipe" }); console.log("skapade", dbName); }
catch (e) { if (!String((e as { stderr: Buffer }).stderr).includes("already exists")) throw e; }

const db = new pg.Client({ connectionString: url.href });
await db.connect();
await db.query(readFileSync("db/schema.sql", "utf8"));

// BAS-kontoplanen distribueras inte med projektet (BAS-kontogruppens villkor). Hämtas från bas.se första gången.
if (!existsSync("db/bas2026.json")) {
  console.log("Hämtar BAS 2026 från bas.se …");
  try { execSync("node --no-warnings scripts/import-bas.ts", { stdio: "inherit" }); }
  catch { console.error("Kunde inte hämta kontoplanen från bas.se. Kontrollera nätverket, eller ladda ner Excel-filen manuellt och kör: yarn bas:import <fil.xlsx>"); process.exit(1); }
}
const bas: { number: number; name: string }[] = JSON.parse(readFileSync("db/bas2026.json", "utf8"));
await db.query(
  `INSERT INTO accounts (number, name) SELECT * FROM unnest($1::int[], $2::text[]) ON CONFLICT (number) DO NOTHING`,
  [bas.map((a) => a.number), bas.map((a) => a.name)],
);
const { rows } = await db.query("SELECT count(*)::int AS n FROM accounts");
console.log(rows[0].n, "konton i databasen");
await db.end();
