import { StoreOrderCreate } from "@/components/store-order-create";
import { getAdminLocale } from "@/lib/admin-locale";
import { storeOrdersCopy } from "@/lib/store-orders-copy";

export async function generateMetadata() {
  return { title: storeOrdersCopy(await getAdminLocale()).createOrder };
}

export default function Page() {
  return <StoreOrderCreate />;
}
