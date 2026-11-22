import { CSAPurchaseRequestDetail } from "@/components/csa-purchase-request-detail";
import { csaPurchaseHref, readCsaPurchaseListContext } from "@/lib/csa-purchase-navigation";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const listContext = readCsaPurchaseListContext({
    get: (name) => (typeof query[name] === "string" ? query[name] : null),
  });
  return (
    <CSAPurchaseRequestDetail key={id} requestId={id} backHref={csaPurchaseHref(listContext)} />
  );
}
