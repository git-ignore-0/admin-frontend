"use client";

import { useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { PageHeading } from "@/components/page-heading";
import { formatAdminDateTime } from "@/lib/admin-date";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { Dashboard } from "@/lib/types";

export default function DashboardPage() {
  const { t } = useAdminI18n();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Dashboard>("admin/dashboard")
      .then(setData)
      .catch((caught) => setError(requestErrorMessage(caught, t)));
  }, [t]);
  const labels: Record<string, string> = {
    "site_settings.update": t.dashboard.actions.siteSettingsUpdate,
    "workshop.create": t.dashboard.actions.workshopCreate,
    "workshop.update": t.dashboard.actions.workshopUpdate,
    "workshop.publish": t.dashboard.actions.workshopPublish,
    "workshop.unpublish": t.dashboard.actions.workshopUnpublish,
    "workshop.archive": t.dashboard.actions.workshopArchive,
    "workshop.delete_draft": t.dashboard.actions.workshopDeleteDraft,
    "media.upload": t.dashboard.actions.mediaUpload,
    "testimonial.create": t.dashboard.actions.testimonialCreate,
    "testimonial.update": t.dashboard.actions.testimonialUpdate,
    "testimonial.publish": t.dashboard.actions.testimonialPublish,
    "testimonial.hide": t.dashboard.actions.testimonialHide,
    "testimonial.unpublish": t.dashboard.actions.testimonialUnpublish,
    "testimonial.media.upload": t.dashboard.actions.testimonialMediaUpload,
  };
  return (
    <>
      <PageHeading title={t.common.dashboard} description={t.page.dashboardDescription} />
      {error && <p className="error-box">{error}</p>}
      <section className="stats" aria-label={t.dashboard.statsLabel}>
        <div className="stat">
          <strong>{data?.upcoming ?? "—"}</strong>
          <span>{t.dashboard.upcoming}</span>
        </div>
        <div className="stat">
          <strong>{data?.drafts ?? "—"}</strong>
          <span>{t.dashboard.drafts}</span>
        </div>
        <div className="stat">
          <strong>{data?.incomplete_translations ?? "—"}</strong>
          <span>{t.dashboard.incomplete}</span>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>{t.dashboard.recent}</h2>
        </div>
        {!data?.recent_activity.length ? (
          <div className="empty">{t.dashboard.empty}</div>
        ) : (
          <ul className="activity">
            {data.recent_activity.map((item, index) => (
              <li key={`${item.entity_id}-${index}`}>
                <span>{labels[item.action] ?? t.dashboard.actions.unknown}</span>
                <time>{formatAdminDateTime(item.created_at)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
