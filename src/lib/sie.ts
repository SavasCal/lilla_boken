import type { Balance, Voucher, VoucherLine } from "./ledger";

// SIE4 kräver IBM PC8 (CP437). Egen tabell för de tecken som förekommer på svenska.
const CP437: Record<string, number> = { å: 0x86, ä: 0x84, ö: 0x94, Å: 0x8f, Ä: 0x8e, Ö: 0x99, é: 0x82, É: 0x90, ü: 0x81, Ü: 0x9a, ñ: 0xa4 };
export function toCp437(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], code = s.charCodeAt(i);
    out[i] = code < 0x80 ? code : (CP437[ch] ?? 0x3f);
  }
  return out;
}

const str = (s: string) => `"${s.replace(/"/g, "'")}"`;
const d8 = (d: string) => d.replace(/-/g, "");
const amt = (n: number) => n.toFixed(2);

export function buildSie(opts: {
  company: string; orgnr: string; year: { start_date: string; end_date: string };
  accounts: { number: number; name: string }[]; balances: Balance[];
  vouchers: (Voucher & { lines: VoucherLine[] })[];
}): string {
  const o: string[] = [
    "#FLAGGA 0", `#PROGRAM ${str("Lilla boken")} 1.0`, "#FORMAT PC8",
    `#GEN ${d8(new Date().toISOString().slice(0, 10))}`, "#SIETYP 4",
    `#FNAMN ${str(opts.company)}`,
  ];
  if (opts.orgnr) o.push(`#ORGNR ${opts.orgnr}`);
  o.push(`#RAR 0 ${d8(opts.year.start_date)} ${d8(opts.year.end_date)}`, "#KPTYP BAS2014");
  for (const a of opts.accounts) o.push(`#KONTO ${a.number} ${str(a.name)}`);
  const ib = new Map<number, number>();
  for (const v of opts.vouchers) if (v.opening) for (const l of v.lines) ib.set(l.account, (ib.get(l.account) ?? 0) + l.debit - l.credit);
  for (const b of opts.balances) {
    const net = b.debit - b.credit;
    if (b.account < 3000) o.push(`#IB 0 ${b.account} ${amt(ib.get(b.account) ?? 0)}`, `#UB 0 ${b.account} ${amt(net)}`);
    else o.push(`#RES 0 ${b.account} ${amt(net)}`);
  }
  for (const v of opts.vouchers) {
    if (v.opening) continue;
    o.push(`#VER "A" ${v.number} ${d8(v.date)} ${str(v.description)}`, "{");
    for (const l of v.lines) o.push(`   #TRANS ${l.account} {} ${amt(l.debit - l.credit)}`);
    o.push("}");
  }
  return o.join("\r\n") + "\r\n";
}
