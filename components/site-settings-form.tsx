"use client";

import { useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { ExternalLink, SiteSettings } from "@/lib/types";

// Store is now an internal public page with its own fixed Farmbrite destinations.
// It must not be configurable through site settings.
const editableLinkKinds = ["facebook", "youtube", "forum"] as const;
type EditableLinkKind = (typeof editableLinkKinds)[number];
type ConfigurableLinkKind = Exclude<ExternalLink["kind"], "store">;

export function SiteSettingsForm() {
  const { t } = useAdminI18n();
  const showToast = useToast();
  const [data, setData] = useState<SiteSettings | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const kindLabels: Record<ConfigurableLinkKind, string> = t.settings.linkLabels;
  useEffect(() => {
    api<SiteSettings>("admin/site-settings")
      .then(setData)
      .catch((caught) => setLoadError(requestErrorMessage(caught, t)));
  }, [t]);
  if (!data) return <div className="panel">{loadError || t.settings.loading}</div>;
  function updateLink(kind: EditableLinkKind, patch: Partial<ExternalLink>) {
    setData((current) => {
      if (!current) return current;
      const existing = current.links.find((item) => item.kind === kind) ?? {
        kind,
        label: kindLabels[kind],
        url: "",
        position: editableLinkKinds.indexOf(kind),
        is_enabled: false,
      };
      return {
        ...current,
        links: [...current.links.filter((item) => item.kind !== kind), { ...existing, ...patch }],
      };
    });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    const currentData = data;
    if (!currentData) return;

    const submittedLinks = currentData.links.filter(
      (link): link is ExternalLink & { kind: ConfigurableLinkKind } => link.kind !== "store",
    );
    const invalidLink = submittedLinks.find((link) => {
      if (!link.url) return link.is_enabled;
      try {
        const parsed = new URL(link.url);
        return !["http:", "https:"].includes(parsed.protocol);
      } catch {
        return true;
      }
    });
    if (invalidLink) {
      const message = invalidLink.url ? t.settings.linkUrlInvalid : t.settings.linkUrlRequired;
      showToast(message.replace("{link}", kindLabels[invalidLink.kind]), "error");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const links = submittedLinks
        .map((link) => ({
          kind: link.kind,
          label: link.label,
          url: link.url,
          position: link.position,
          is_enabled: link.is_enabled,
        }))
        .sort((a, b) => a.position - b.position);
      const saved = await api<SiteSettings>("admin/site-settings", {
        method: "PATCH",
        body: JSON.stringify({
          ...currentData,
          links,
        }),
      });
      setData(saved);
      showToast(t.settings.saved);
    } catch (caught) {
      showToast(
        caught instanceof Error && caught.message === "version_conflict"
          ? t.settings.conflict
          : requestErrorMessage(caught, t, {
              email: t.settings.email,
              phone_display: t.settings.phoneDisplay,
              links: t.settings.links,
            }),
        "error",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate>
      <section className="panel">
        <div className="panel-head">
          <h2>{t.settings.contact}</h2>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="email">{t.settings.email}</label>
            <input
              id="email"
              className="input"
              type="email"
              value={data.email}
              onChange={(e) => setData({ ...data, email: e.target.value })}
            />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={data.is_email_enabled}
                onChange={(e) => setData({ ...data, is_email_enabled: e.target.checked })}
              />
              {t.settings.showEmail}
            </label>
          </div>
          <div className="field">
            <label htmlFor="phone-display">{t.settings.phoneDisplay}</label>
            <input
              id="phone-display"
              className="input"
              value={data.phone_display}
              onChange={(e) => setData({ ...data, phone_display: e.target.value })}
            />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={data.is_phone_enabled}
                onChange={(e) => setData({ ...data, is_phone_enabled: e.target.checked })}
              />
              {t.settings.showPhone}
            </label>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>{t.settings.links}</h2>
        </div>
        <div className="form-grid one">
          {editableLinkKinds.map((kind) => {
            const link = data.links.find((item) => item.kind === kind) ?? {
              kind,
              label: kindLabels[kind],
              url: "",
              position: editableLinkKinds.indexOf(kind),
              is_enabled: false,
            };
            return (
              <div className="link-row" key={kind}>
                <div className="field">
                  <label htmlFor={`link-${kind}`}>{kindLabels[kind]}</label>
                  <input
                    id={`link-${kind}`}
                    className="input"
                    type="url"
                    placeholder="https://"
                    value={link.url}
                    onChange={(e) => updateLink(kind, { url: e.target.value })}
                  />
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={link.is_enabled}
                    onChange={(e) => updateLink(kind, { is_enabled: e.target.checked })}
                  />
                  {t.settings.showLink}
                </label>
              </div>
            );
          })}
        </div>
      </section>
      <div className="form-actions">
        <button className="button" disabled={saving}>
          {saving ? t.settings.saving : t.settings.save}
        </button>
      </div>
    </form>
  );
}
