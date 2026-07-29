import Link from "next/link";

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
      <Link className="detail-back-link" href={backHref}>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M19 12H5m6-6-6 6 6 6" />
        </svg>
        <span>{backLabel}</span>
      </Link>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
