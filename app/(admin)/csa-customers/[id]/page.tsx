import { CSACustomerDetail } from "@/components/csa-customer-detail";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CSACustomerDetail customerId={id} />;
}
