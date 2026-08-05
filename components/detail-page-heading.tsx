import { DetailBackLink } from "@/components/detail-back-link";

export function DetailPageHeading({
  backHref,
  backLabel,
  title,
  description,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="detail-page-heading">
      <DetailBackLink href={backHref} label={backLabel} />
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
