"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { formatAdminDateTimeInZone } from "@/lib/admin-date";
import type { Workshop } from "@/lib/types";

export function WorkshopList() {
  const { t } = useAdminI18n();
  const [items, setItems] = useState<Workshop[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Workshop[]>("admin/workshops/")
      .then(setItems)
      .catch((caught) => setError(requestErrorMessage(caught, t)));
  }, [t]);
  const statusLabel: Record<string, string> = t.workshops.status;
  if (error) return <p className="error-box">{error}</p>;
  if (!items) return <div className="panel">{t.workshops.loading}</div>;
  if (!items.length)
    return (
      <div className="empty">
        <p>{t.workshops.empty}</p>
        <Link className="button" href="/workshops/new">
          {t.workshops.createFirst}
        </Link>
      </div>
    );
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{t.workshops.tableWorkshop}</th>
            <th>{t.workshops.tableTime}</th>
            <th>{t.workshops.tableLanguages}</th>
            <th>{t.workshops.tableStatus}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const title =
              item.translations.find((translation) => translation.locale === item.default_locale)
                ?.title || t.workshops.untitled;
            return (
              <tr key={item.id}>
                <td>
                  <strong>{title}</strong>
                </td>
                <td>
                  {formatAdminDateTimeInZone(item.start_at, item.event_timezone)}
                </td>
                <td>
                  {item.translations.map((t) => (
                    <span className={`badge ${t.is_ready ? "" : "warm"}`} key={t.locale}>
                      {t.locale.toUpperCase()}
                    </span>
                  ))}
                </td>
                <td>
                  <span className="badge">
                    {statusLabel[item.effective_status] ?? item.effective_status}
                  </span>
                  {item.has_published_revision && (
                    <>
                      {" "}
                      <span className="badge warm">{t.workshops.publiclyVisible}</span>
                    </>
                  )}
                </td>
                <td>
                  <Link className="button secondary" href={`/workshops/${item.id}`}>
                    {t.workshops.edit}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
