import { DetailBackLink } from "@/components/detail-back-link";

export function PageHeading({
  title,
  description,
  action,
  backHref,
  backLabel,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  const hasBackLink = Boolean(backHref && backLabel);
  return (
    <header className={`page-heading${hasBackLink ? " with-back" : ""}`}>
      {backHref && backLabel && <DetailBackLink href={backHref} label={backLabel} />}
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
