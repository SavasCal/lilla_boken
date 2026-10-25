import { requireCompany } from "@/lib/company";
import { activeAccounts } from "@/lib/ledger";
import { VoucherForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NyVerifikation({ searchParams }: { searchParams: Promise<{ mall?: string }> }) {
  const { mall } = await searchParams;
  const [company, accounts] = await Promise.all([requireCompany(), activeAccounts()]);
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Ny verifikation</h1>
      <VoucherForm accounts={accounts.map((a) => [a.number, a.name])} vatMethod={company.vat_method} initialTemplate={mall} />
    </div>
  );
}
