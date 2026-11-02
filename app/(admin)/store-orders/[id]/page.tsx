import { StoreOrderDetail } from "@/components/store-order-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StoreOrderDetail orderId={id} />;
}
