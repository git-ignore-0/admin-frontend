import { StoreCategoryDetail } from "@/components/store-category-detail";

export default async function StoreCategoryDetailPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = await params;
  return <StoreCategoryDetail categoryId={categoryId} />;
}
