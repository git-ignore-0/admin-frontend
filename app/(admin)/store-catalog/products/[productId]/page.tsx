import { StoreProductDetail } from "@/components/store-product-detail";

export default async function StoreProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <StoreProductDetail productId={productId} />;
}
