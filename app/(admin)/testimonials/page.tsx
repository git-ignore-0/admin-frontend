import { Button } from "@mantine/core";
import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { TestimonialList } from "@/components/testimonial-list";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.common.testimonials };
}

export default async function TestimonialsPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading
        action={
          <Button component={Link} href="/testimonials/new">
            {t.testimonials.create}
          </Button>
        }
        description={t.page.testimonialsDescription}
        title={t.common.testimonials}
      />
      <TestimonialList />
    </>
  );
}
