import { DetailPageHeading } from "@/components/detail-page-heading";
import { TestimonialEditor } from "@/components/testimonial-editor";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.testimonials.newTitle };
}

export default async function NewTestimonialPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <DetailPageHeading
        backHref="/testimonials"
        backLabel={t.testimonials.backLabel}
        description={t.testimonials.newDescription}
        title={t.testimonials.newTitle}
      />
      <TestimonialEditor />
    </>
  );
}
