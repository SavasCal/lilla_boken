import { round2 } from "./money";

export type Line = { account: string; debit: string; credit: string; description: string };
export type VatMethod = "faktura" | "bokslut";
export type Template = {
  id: string;
  label: string;
  /** om satt: visas bara för dessa momsmetoder */
  methods?: VatMethod[];
  /** om satt: användaren väljer kostnads-/intäktskonto */
  pickAccount?: { label: string; def: string };
  build: (gross: number, acct: string) => Line[];
};

const L = (account: string | number, debit = 0, credit = 0): Line => ({
  account: String(account), debit: debit ? String(debit) : "", credit: credit ? String(credit) : "", description: "",
});
const split = (gross: number, rate: number) => {
  const vat = round2((gross * rate) / (1 + rate));
  return { net: round2(gross - vat), vat };
};
const supplier = (rate: number, vatAcct: number) => (gross: number, acct: string) => {
  const { net, vat } = split(gross, rate);
  return [L(acct, net), L(vatAcct, vat), L(2440, 0, gross)];
};

const paid = (rate: number) => (gross: number, acct: string) => {
  const { net, vat } = split(gross, rate);
  return [L(acct, net), L(2640, vat), L(1930, 0, gross)];
};
const F: VatMethod[] = ["faktura"], B: VatMethod[] = ["bokslut"];

export const TEMPLATES: Template[] = [
  { id: "tom", label: "Tom verifikation", build: () => [L(""), L("")] },
  // Faktureringsmetoden: moms redovisas när fakturan bokförs, skulden/fordran via 2440/1510
  { id: "lev25", label: "Leverantörsfaktura 25 % moms", methods: F, pickAccount: { label: "Kostnadskonto", def: "4010" }, build: supplier(0.25, 2640) },
  { id: "lev12", label: "Leverantörsfaktura 12 % moms", methods: F, pickAccount: { label: "Kostnadskonto", def: "4010" }, build: supplier(0.12, 2640) },
  { id: "lev06", label: "Leverantörsfaktura 6 % moms", methods: F, pickAccount: { label: "Kostnadskonto", def: "6970" }, build: supplier(0.06, 2640) },
  { id: "kund25", label: "Kundfaktura 25 % moms", methods: F, pickAccount: { label: "Intäktskonto", def: "3001" },
    build: (gross, acct) => { const { net, vat } = split(gross, 0.25); return [L(1510, gross), L(acct, 0, net), L(2610, 0, vat)]; } },
  { id: "betlev", label: "Betalning av leverantörsfaktura", methods: F, build: (gross) => [L(2440, gross), L(1930, 0, gross)] },
  { id: "betkund", label: "Kundbetalning", methods: F, build: (gross) => [L(1930, gross), L(1510, 0, gross)] },
  // Bokslutsmetoden (kontantmetoden): bokförs och momsredovisas vid betalning, direkt mot 1930
  { id: "bet25", label: "Betald leverantörsfaktura 25 % moms", methods: B, pickAccount: { label: "Kostnadskonto", def: "4010" }, build: paid(0.25) },
  { id: "bet12", label: "Betald leverantörsfaktura 12 % moms", methods: B, pickAccount: { label: "Kostnadskonto", def: "4010" }, build: paid(0.12) },
  { id: "bet06", label: "Betald leverantörsfaktura 6 % moms", methods: B, pickAccount: { label: "Kostnadskonto", def: "6970" }, build: paid(0.06) },
  { id: "inb25", label: "Inbetald kundfaktura 25 % moms", methods: B, pickAccount: { label: "Intäktskonto", def: "3001" },
    build: (gross, acct) => { const { net, vat } = split(gross, 0.25); return [L(1930, gross), L(acct, 0, net), L(2610, 0, vat)]; } },
  // Båda metoderna
  { id: "kort25", label: "Kortköp/direktbetalt 25 % moms", pickAccount: { label: "Kostnadskonto", def: "6110" }, build: paid(0.25) },
  // Bokslutsposter (belopp exkl. moms)
  { id: "avskr", label: "Bokslut: Avskrivning inventarier", pickAccount: { label: "Ack. avskrivningar", def: "1229" }, build: (a, acct) => [L(7832, a), L(acct, 0, a)] },
  { id: "upplupen", label: "Bokslut: Upplupen kostnad", pickAccount: { label: "Kostnadskonto", def: "6530" }, build: (a, acct) => [L(acct, a), L(2990, 0, a)] },
  { id: "forutbet", label: "Bokslut: Förutbetald kostnad", pickAccount: { label: "Kostnadskonto", def: "5010" }, build: (a, acct) => [L(1790, a), L(acct, 0, a)] },
  { id: "skatt", label: "Bokslut: Årets bolagsskatt", build: (a) => [L(8910, a), L(2510, 0, a)] },
];
export const templatesFor = (m: VatMethod) => TEMPLATES.filter((t) => !t.methods || t.methods.includes(m));
