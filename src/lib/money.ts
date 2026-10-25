const nf = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const clean = (n: number) => { const r = round2(n); return r === 0 ? 0 : r; }; // tar bort -0
export const fmt = (n: number) => (clean(n) === 0 ? "" : nf.format(clean(n)));
export const fmt0 = (n: number) => nf.format(clean(n));
export const fmtTs = (d: Date) => d.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" });
/** "1 234,50" | "1234.50" -> 1234.5 ; ogiltigt -> NaN */
export const parseAmount = (s: string) => {
  const t = s.replace(/\s/g, "").replace(",", ".");
  return t === "" ? 0 : /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
};
export const fmtKr = (n: number) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(Math.round(n) || 0);
