import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Logo } from "./logo";
import { companies, currentCompany } from "@/lib/company";
import { switchCompany } from "./foretag/actions";

export const metadata: Metadata = { title: "Lilla boken", description: "Löpande bokföring" };

const nav: [string, string][] = [
  ["/", "Översikt"],
  ["/verifikationer", "Grundbok"],
  ["/huvudbok", "Huvudbok"],
  ["/rapporter/resultat", "Resultaträkning"],
  ["/rapporter/balans", "Balansräkning"],
  ["/rapporter/moms", "Momsrapport"],
  ["/bokslut", "Bokslut"],
  ["/konton", "Kontoplan"],
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [all, current] = await Promise.all([companies(), currentCompany()]);
  return (
    <html lang="sv" className="h-full">
      <body className="flex min-h-full bg-stone-50 text-stone-900">
        <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-stone-200 bg-white px-3 py-4">
          <Link href="/" className="flex items-center gap-2.5 px-3 text-lg font-semibold tracking-tight"><Logo />Lilla boken</Link>
          <div className="mt-5 px-3">
            {all.length > 1 ? (
              <form action={switchCompany} className="flex gap-1">
                <select name="id" defaultValue={current?.id} className="min-w-0 flex-1 text-xs">
                  {all.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button className="btn btn-ghost px-2 py-1 text-xs">Byt</button>
              </form>
            ) : (
              <div className="truncate text-sm font-medium">{current?.name ?? "Inget företag"}</div>
            )}
            <Link href="/foretag" className="text-xs text-stone-500 underline hover:text-stone-900">Företag &amp; inställningar</Link>
          </div>
          <Link href="/verifikationer/ny" className="btn mt-4 text-center">+ Ny verifikation</Link>
          <nav className="mt-6 flex flex-col gap-0.5 text-sm">
            {nav.map(([href, label]) => (
              <Link key={href} href={href} className="rounded px-3 py-1.5 text-stone-700 hover:bg-stone-100 hover:text-stone-900">{label}</Link>
            ))}
          </nav>
          <a href="/api/sie" className="mt-auto px-3 text-xs text-stone-500 underline hover:text-stone-900">Exportera SIE4</a>
        </aside>
        <main className="min-w-0 flex-1 px-8 py-6"><div className="mx-auto max-w-5xl">{children}</div></main>
      </body>
    </html>
  );
}
