"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { normalizeTiptapLinks, RichTextEditor } from "@/components/rich-text-editor";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { publicSiteOrigin } from "@/lib/public-site";
import {
  emptyTranslation,
  type Locale,
  type Workshop,
  type WorkshopTranslation,
} from "@/lib/types";
import { formatZonedDateTimeInput, zonedDateTimeInputToIso } from "@/lib/zoned-date-time";

function initialWorkshop(): Workshop {
  const eventTimezone = "Asia/Ho_Chi_Minh";
  const futureDate = formatZonedDateTimeInput(
    new Date(Date.now() + 7 * 86400_000).toISOString(),
    eventTimezone,
  ).slice(0, 10);
  const start = zonedDateTimeInputToIso(`${futureDate}T09:00`, eventTimezone);
  const end = new Date(new Date(start).getTime() + 5 * 3600_000).toISOString();
  return {
    id: "",
    revision_id: "",
    revision_number: 1,
    version: 1,
    default_locale: "vi",
    start_at: start,
    end_at: end,
    event_timezone: eventTimezone,
    effective_status: "upcoming",
    registration_url: "",
    has_published_revision: false,
    translations: [emptyTranslation("vi")],
    updated_at: "",
  };
}

export function completeness(item: WorkshopTranslation) {
  function hasVisibleContent(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(hasVisibleContent);
    if (!value || typeof value !== "object") return false;
    const node = value as Record<string, unknown>;
    if (node.type === "image") return true;
    if (typeof node.text === "string" && node.text.trim()) return true;
    return hasVisibleContent(node.content);
  }

  const hasBody = hasVisibleContent(item.body);
  const values = [item.title, item.summary];
  if (!values.some(Boolean) && !hasBody) return "empty";
  if (values.every((value) => value.trim()) && hasBody) return "ready";
  return "partial";
}

export function WorkshopEditor({ workshopId }: { workshopId?: string }) {
  const router = useRouter();
  const { t } = useAdminI18n();
  const showToast = useToast();
  const [data, setData] = useState<Workshop>(initialWorkshop());
  const [activeLocale, setActiveLocale] = useState<Locale>("vi");
  const [loading, setLoading] = useState(Boolean(workshopId));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [publishing, setPublishing] = useState(false);
  const publishingRef = useRef(false);
  const [loadError, setLoadError] = useState("");
  const localeNames: Record<Locale, string> = {
    vi: t.common.vietnamese,
    en: t.common.english,
  };

  useEffect(() => {
    if (!workshopId) return;
    api<Workshop>(`admin/workshops/${workshopId}/`)
      .then((item) => {
        setData(item);
        setActiveLocale(item.default_locale);
      })
      .catch((caught) => setLoadError(requestErrorMessage(caught, t)))
      .finally(() => setLoading(false));
  }, [t, workshopId]);

  const translation = useMemo(
    () =>
      data.translations.find((item) => item.locale === activeLocale) ??
      emptyTranslation(activeLocale),
    [activeLocale, data.translations],
  );

  function update(patch: Partial<Workshop>) {
    setData((current) => ({ ...current, ...patch }));
  }

  function updateTranslation(patch: Partial<WorkshopTranslation>) {
    setData((current) => ({
      ...current,
      translations: [
        ...current.translations.filter((item) => item.locale !== activeLocale),
        { ...translation, ...patch },
      ],
    }));
  }

  function selectLocale(locale: Locale) {
    if (!data.translations.some((item) => item.locale === locale)) {
      setData((current) => ({
        ...current,
        translations: [...current.translations, emptyTranslation(locale)],
      }));
    }
    setActiveLocale(locale);
  }

  function moveLocaleTab(event: React.KeyboardEvent<HTMLButtonElement>, locale: Locale) {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const nextLocale: Locale = locale === "vi" ? "en" : "vi";
    selectLocale(nextLocale);
    document.getElementById(`workshop-locale-${nextLocale}`)?.focus();
  }

  function payload() {
    return {
      ...(workshopId ? { version: data.version } : {}),
      start_at: new Date(data.start_at).toISOString(),
      end_at: new Date(data.end_at).toISOString(),
      event_timezone: data.event_timezone,
      registration_url: data.registration_url,
      translations: data.translations.map((item) => ({
        locale: item.locale,
        title: item.title,
        summary: item.summary,
        body: normalizeTiptapLinks(item.body),
      })),
    };
  }

  async function save(notify = true) {
    if (savingRef.current) return null;
    if (!data.translations.some((item) => item.title.trim())) {
      showToast(t.editor.titleRequired, "error");
      return null;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await api<Workshop>(
        workshopId ? `admin/workshops/${workshopId}/` : "admin/workshops/",
        { method: workshopId ? "PATCH" : "POST", body: JSON.stringify(payload()) },
      );
      setData(saved);
      if (notify) showToast(t.editor.draftSaved);
      if (!workshopId) router.replace(`/workshops/${saved.id}`);
      return saved;
    } catch (caught) {
      const error = caught as Error & { status?: number };
      showToast(
        error.status === 409
          ? t.editor.conflict
          : requestErrorMessage(caught, t, {
              start_at: t.editor.start,
              end_at: t.editor.end,
              registration_url: t.editor.registrationUrl,
              translations: t.editor.localizedContent,
              title: t.editor.title,
              summary: t.editor.summary,
              body: t.editor.body,
            }),
        "error",
      );
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function publish() {
    if (publishingRef.current) return;
    const readyLocales = (["vi", "en"] as Locale[]).filter((locale) => {
      const item = data.translations.find((entry) => entry.locale === locale);
      return item && completeness(item) === "ready";
    });
    if (!readyLocales.length) {
      showToast(t.editor.noReadyTranslation, "error");
      return;
    }
    const skippedLocales = (["vi", "en"] as Locale[]).filter(
      (locale) => !readyLocales.includes(locale),
    );
    const confirmation = [
      t.editor.confirmPublish,
      `${t.editor.publishReady}: ${readyLocales.map((locale) => localeNames[locale]).join(", ")}`,
      `${t.editor.publishSkipped}: ${skippedLocales.map((locale) => localeNames[locale]).join(", ")}`,
    ].join("\n\n");
    if (!window.confirm(confirmation)) return;
    publishingRef.current = true;
    setPublishing(true);
    try {
      const saved = await save(false);
      if (!saved) return;
      const result = await api<{ draft: Workshop }>(`admin/workshops/${saved.id}/publish/`, {
        method: "POST",
        body: JSON.stringify({ revision_id: saved.revision_id, version: saved.version }),
      });
      setData(result.draft);
      showToast(t.editor.published);
    } catch (caught) {
      const message = requestErrorMessage(caught, t);
      showToast(message === t.common.requestFailed ? t.editor.publishFailed : message, "error");
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  }

  async function unpublish() {
    if (!window.confirm(t.editor.confirmUnpublish)) return;
    try {
      await api(`admin/workshops/${data.id}/unpublish/`, { method: "POST" });
      setData({ ...data, has_published_revision: false });
      showToast(t.editor.unpublished);
    } catch (caught) {
      showToast(requestErrorMessage(caught, t), "error");
    }
  }

  async function preview() {
    const saved = await save();
    if (!saved) return;
    try {
      const result = await api<{ token: string }>(`admin/workshops/${saved.id}/preview-token/`, {
        method: "POST",
      });
      window.open(
        `${publicSiteOrigin()}/workshops/preview/${encodeURIComponent(result.token)}?locale=${activeLocale}`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch (caught) {
      showToast(requestErrorMessage(caught, t), "error");
    }
  }

  if (loading) return <div className="panel">{t.editor.loading}</div>;
  if (loadError) return <p className="error-box">{loadError}</p>;

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow editor-step">{t.editor.step1}</p>
            <h2>{t.editor.localizedContent}</h2>
          </div>
          {data.has_published_revision && <span className="badge">{t.editor.publicBadge}</span>}
        </div>

        <div className="workshop-language-picker">
          <p className="label">{t.editor.contentLanguage}</p>
          <div className="tabs" role="tablist" aria-label={t.editor.contentLanguage}>
            {(["vi", "en"] as Locale[]).map((locale) => {
              const item = data.translations.find((entry) => entry.locale === locale);
              const state = item ? completeness(item) : "empty";
              const stateLabel =
                state === "ready"
                  ? t.editor.ready
                  : state === "partial"
                    ? t.editor.partial
                    : t.editor.empty;
              return (
                <button
                  id={`workshop-locale-${locale}`}
                  type="button"
                  role="tab"
                  aria-selected={activeLocale === locale}
                  aria-controls={`workshop-translation-${locale}`}
                  tabIndex={activeLocale === locale ? 0 : -1}
                  className={`tab ${activeLocale === locale ? "active" : ""}`}
                  onClick={() => selectLocale(locale)}
                  onKeyDown={(event) => moveLocaleTab(event, locale)}
                  key={locale}
                >
                  <span className="locale-code" aria-hidden="true">
                    {locale.toUpperCase()}
                  </span>
                  <span className="locale-copy">
                    <strong>{localeNames[locale]}</strong>
                    <small className={`locale-status ${state}`}>{stateLabel}</small>
                  </span>
                  {locale === "en" && !item && (
                    <span className="locale-add" aria-hidden="true">
                      +
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div
          id={`workshop-translation-${activeLocale}`}
          className="form-grid"
          role="tabpanel"
          aria-labelledby={`workshop-locale-${activeLocale}`}
        >
          <div className="field full">
            <label htmlFor={`workshop-title-${activeLocale}`}>{t.editor.title}</label>
            <input
              id={`workshop-title-${activeLocale}`}
              className="input"
              type="text"
              maxLength={240}
              value={translation.title}
              onChange={(event) => updateTranslation({ title: event.target.value })}
            />
          </div>
          <div className="field full">
            <label htmlFor={`workshop-summary-${activeLocale}`}>{t.editor.summary}</label>
            <textarea
              id={`workshop-summary-${activeLocale}`}
              className="textarea"
              maxLength={800}
              value={translation.summary}
              onChange={(event) => updateTranslation({ summary: event.target.value })}
            />
          </div>
          <div className="field full">
            <label>{t.editor.body}</label>
            <RichTextEditor
              value={translation.body}
              imageAlt={translation.title}
              onChange={(body) => updateTranslation({ body })}
            />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow editor-step">{t.editor.step2}</p>
            <h2>{t.editor.scheduleAndRegistration}</h2>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="workshop-start">{t.editor.start}</label>
            <input
              id="workshop-start"
              className="input"
              type="datetime-local"
              required
              value={formatZonedDateTimeInput(data.start_at, data.event_timezone)}
              onChange={(event) =>
                update({
                  start_at: zonedDateTimeInputToIso(event.target.value, data.event_timezone),
                })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="workshop-end">{t.editor.end}</label>
            <input
              id="workshop-end"
              className="input"
              type="datetime-local"
              required
              value={formatZonedDateTimeInput(data.end_at, data.event_timezone)}
              onChange={(event) =>
                update({ end_at: zonedDateTimeInputToIso(event.target.value, data.event_timezone) })
              }
            />
          </div>
          <div className="field full">
            <label htmlFor="workshop-registration-url">{t.editor.registrationUrl}</label>
            <input
              id="workshop-registration-url"
              className="input"
              type="url"
              inputMode="url"
              maxLength={500}
              placeholder="https://forms.google.com/…"
              value={data.registration_url}
              onChange={(event) => update({ registration_url: event.target.value })}
            />
          </div>
        </div>
      </section>

      <div className="form-actions">
        {data.has_published_revision && (
          <button
            type="button"
            className="button danger"
            disabled={saving || publishing}
            onClick={() => void unpublish()}
          >
            {t.editor.unpublish}
          </button>
        )}
        {workshopId && (
          <button
            type="button"
            className="button secondary"
            disabled={saving || publishing}
            onClick={() => void preview()}
          >
            {t.editor.preview}
          </button>
        )}
        <button
          type="button"
          className="button secondary"
          disabled={saving || publishing}
          onClick={() => void save()}
        >
          {saving ? t.editor.saving : t.editor.saveDraft}
        </button>
        {workshopId && (
          <button
            type="button"
            className="button"
            disabled={saving || publishing}
            onClick={() => void publish()}
          >
            {publishing ? t.editor.publishing : t.editor.publish}
          </button>
        )}
      </div>
    </>
  );
}
