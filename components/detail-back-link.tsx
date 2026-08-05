import Link from "next/link";

export function DetailBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="detail-back-link" href={href}>
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M19 12H5m6-6-6 6 6 6" />
      </svg>
      <span>{label}</span>
    </Link>
  );
}
