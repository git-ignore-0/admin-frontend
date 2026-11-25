"use client";
import { DataState } from "@/components/nfv-controls";

import { FormInput } from "@/components/nfv-controls";

import { Button, Checkbox } from "@mantine/core";

import { useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { formatVietnamPhone, handlePhonePaste, normalizeLocalPhone } from "@/lib/phone-number";
import type { ExternalLink, SiteSettings } from "@/lib/types";

// Store is now an internal public page with its own fixed Farmbrite destinations.
// It must not be configurable through site settings.
const editableLinkKinds = ["facebook", "youtube", "forum", "farms"] as const;
type EditableLinkKind = (typeof editableLinkKinds)[number];
type ConfigurableLinkKind = Exclude<ExternalLink["kind"], "store">;

export function SiteSettingsForm() {
  const { t } = useAdminI18n();
  const showToast = useToast();
  const [data, setData] = useState<SiteSettings | null>(null);
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const kindLabels: Record<ConfigurableLinkKind, string> = t.settings.linkLabels;
  const invalidPhone = Boolean(phoneDraft && !normalizeLocalPhone(phoneDraft, "contact"));
  useEffect(() => {
    api<SiteSettings>("admin/site-settings")
      .then(setData)
      .catch((caught) => setLoadError(requestErrorMessage(caught, t)));
  }, [t]);
  if (!data)
    return (
      <DataState kind={loadError ? "error" : "loading"} title={loadError || t.settings.loading} />
    );
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
    if (savingRef.current || invalidPhone) return;
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
          // The public site displays this field verbatim.
          phone_display: phoneDraft ?? currentData.phone_display,
          links,
        }),
      });
      setData(saved);
      setPhoneDraft(null);
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
            <FormInput
              id="email"
              type="email"
              value={data.email}
              onChange={(e) => setData({ ...data, email: e.target.value })}
            />
            <Checkbox
              checked={data.is_email_enabled}
              onChange={(e) => setData({ ...data, is_email_enabled: e.target.checked })}
              label={t.settings.showEmail}
            />
          </div>
          <div className="field">
            <label htmlFor="phone-display">{t.settings.phoneDisplay}</label>
            <FormInput
              id="phone-display"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              disabled={saving}
              error={invalidPhone ? t.common.invalidVietnamPhone : undefined}
              value={phoneDraft ?? formatVietnamPhone(data.phone_display) ?? ""}
              onChange={(event) => setPhoneDraft(event.currentTarget.value)}
              onPaste={(event) => handlePhonePaste(event, setPhoneDraft)}
            />
            <Checkbox
              checked={data.is_phone_enabled}
              onChange={(e) => setData({ ...data, is_phone_enabled: e.target.checked })}
              label={t.settings.showPhone}
            />
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
                  <FormInput
                    id={`link-${kind}`}
                    type="url"
                    placeholder="https://"
                    value={link.url}
                    onChange={(e) => updateLink(kind, { url: e.target.value })}
                  />
                </div>
                <Checkbox
                  checked={link.is_enabled}
                  onChange={(e) => updateLink(kind, { is_enabled: e.target.checked })}
                  label={t.settings.showLink}
                />
              </div>
            );
          })}
        </div>
      </section>
      <div className="form-actions">
        <Button type="submit" disabled={saving || invalidPhone}>
          {saving ? t.settings.saving : t.settings.save}
        </Button>
      </div>
    </form>
  );
}
