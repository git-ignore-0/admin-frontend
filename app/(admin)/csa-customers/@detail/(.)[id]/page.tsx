import { CSACustomerDetail } from "@/components/csa-customer-detail";

export default async function InterceptedCSACustomerDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CSACustomerDetail customerId={id} intercepted />;
}
