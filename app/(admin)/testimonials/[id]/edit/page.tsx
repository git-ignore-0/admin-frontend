import { DetailPageHeading } from "@/components/detail-page-heading";
import { TestimonialEditor } from "@/components/testimonial-editor";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.testimonials.editTitle };
}

export default async function EditTestimonialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <DetailPageHeading
        backHref={`/testimonials/${id}`}
        backLabel={t.testimonials.detailTitle}
        title={t.testimonials.editTitle}
      />
      <TestimonialEditor testimonialId={id} />
    </>
  );
}
