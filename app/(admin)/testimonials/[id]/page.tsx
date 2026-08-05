import { TestimonialDetail } from "@/components/testimonial-detail";

export default async function TestimonialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TestimonialDetail testimonialId={id} />;
}
