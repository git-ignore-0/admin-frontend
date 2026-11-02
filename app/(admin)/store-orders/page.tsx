import { PageHeading } from "@/components/page-heading";
import { StoreOrderList } from "@/components/store-order-list";
import { getAdminLocale } from "@/lib/admin-locale";
import { storeOrdersCopy } from "@/lib/store-orders-copy";

export async function generateMetadata() {
  const c = storeOrdersCopy(await getAdminLocale());
  return { title: c.title };
}

export default async function Page() {
  const c = storeOrdersCopy(await getAdminLocale());
  return (
    <div className="store-orders-page">
      <PageHeading title={c.title} description={c.description} />
      <StoreOrderList />
    </div>
  );
}
