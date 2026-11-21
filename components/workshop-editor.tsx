"use client";

import { Alert, Button, Stack, Tabs, Text } from "@mantine/core";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { LazyRichTextEditor } from "@/components/lazy-rich-text-editor";
import { DataState, FormInput, FormTextarea, Status } from "@/components/nfv-controls";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { normalizeTiptapLinks } from "@/lib/rich-text-links";
import {
  emptyTranslation,
  type Locale,
  type Workshop,
  type WorkshopTranslation,
} from "@/lib/types";
import { formatZonedDateTimeInput, zonedDateTimeInputToIso } from "@/lib/zoned-date-time";

const workshopLocales = ["vi", "en"] as const;
type ConfirmationAction = "publish" | "unpublish" | "delete" | "archive";
type WorkshopAction = ConfirmationAction | "save";

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
  const [loadError, setLoadError] = useState("");
  const [dialog, setDialog] = useState<ConfirmationAction | null>(null);
  const [pendingAction, setPendingAction] = useState<WorkshopAction | null>(null);
  const pendingMutation = useRef<symbol | null>(null);
  const dialogTrigger = useRef<HTMLButtonElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const busy = pendingAction !== null;
  const localeNames: Record<Locale, string> = {
    vi: t.common.vietnamese,
    en: t.common.english,
  };
  const copy = t.editor;
  const confirmationCopy = {
    publish: { label: copy.publish, busyLabel: copy.publishing, message: copy.confirmPublish },
    unpublish: {
      label: copy.unpublish,
      busyLabel: copy.unpublishing,
      message: copy.confirmUnpublish,
    },
    delete: { label: copy.delete, busyLabel: copy.deleting, message: copy.confirmDelete },
    archive: { label: copy.archive, busyLabel: copy.archiving, message: copy.confirmArchive },
  };
  const removalAction = data.has_published_revision ? "archive" : "delete";
  const translationStates = workshopLocales.map((locale) => {
    const item = data.translations.find((entry) => entry.locale === locale);
    return { locale, added: Boolean(item), state: item ? completeness(item) : "empty" } as const;
  });
  const readyLanguages = translationStates
    .filter(({ state }) => state === "ready")
    .map(({ locale }) => localeNames[locale]);
  const skippedLanguages = translationStates
    .filter(({ state }) => state !== "ready")
    .map(({ locale }) => localeNames[locale]);

  useLayoutEffect(() => {
    // The protected shell unmounts this editor on session changes.
    return () => {
      pendingMutation.current = null;
    };
  }, []);

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

  async function save(isCurrent: () => boolean, notify: boolean) {
    if (!data.translations.some((item) => item.title.trim())) {
      showToast(t.editor.titleRequired, "error");
      return null;
    }
    try {
      const saved = await api<Workshop>(
        workshopId ? `admin/workshops/${workshopId}/` : "admin/workshops/",
        { method: workshopId ? "PATCH" : "POST", body: JSON.stringify(payload()) },
        { shouldRedirectToLogin: isCurrent },
      );
      if (!isCurrent()) return null;
      setData(saved);
      if (notify) showToast(t.editor.draftSaved);
      if (!workshopId) router.replace(`/workshops/${saved.id}`);
      return saved;
    } catch (caught) {
      if (!isCurrent()) return null;
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
    }
  }

  function openDialog(action: ConfirmationAction, trigger: HTMLButtonElement) {
    if (dialog || pendingMutation.current) return;
    if (action === "publish" && readyLanguages.length === 0) {
      showToast(t.editor.noReadyTranslation, "error");
      return;
    }
    dialogTrigger.current = trigger;
    setDialog(action);
  }

  async function mutate(action: WorkshopAction) {
    if (pendingMutation.current) return;
    const mutation = Symbol();
    const isCurrent = () => pendingMutation.current === mutation;
    const options = { shouldRedirectToLogin: isCurrent };
    pendingMutation.current = mutation;
    setPendingAction(action);
    try {
      if (action === "save" || action === "publish") {
        const saved = await save(isCurrent, action === "save");
        if (action === "save" || !saved || !isCurrent()) return;
        const result = await api<{ draft: Workshop }>(
          `admin/workshops/${saved.id}/publish/`,
          {
            method: "POST",
            body: JSON.stringify({ revision_id: saved.revision_id, version: saved.version }),
          },
          options,
        );
        if (!isCurrent()) return;
        setData(result.draft);
        showToast(copy.published);
      } else if (action === "unpublish") {
        await api(`admin/workshops/${data.id}/unpublish/`, { method: "POST" }, options);
        if (!isCurrent()) return;
        update({ has_published_revision: false });
        showToast(copy.unpublished);
      } else {
        await api(`admin/workshops/${data.id}/`, { method: "DELETE" }, options);
        if (!isCurrent()) return;
        showToast(action === "archive" ? copy.archived : copy.deleted);
        router.replace("/workshops");
      }
    } catch (caught) {
      if (!isCurrent()) return;
      const message = requestErrorMessage(caught, t);
      showToast(
        action === "publish" && message === t.common.requestFailed ? copy.publishFailed : message,
        "error",
      );
    } finally {
      if (isCurrent()) {
        pendingMutation.current = null;
        setPendingAction(null);
        setDialog(null);
      }
    }
  }

  if (loading) return <DataState kind="loading" title={t.editor.loading} />;
  if (loadError) return <Alert color="red">{loadError}</Alert>;

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow editor-step">{t.editor.step1}</p>
            <h2>{t.editor.localizedContent}</h2>
          </div>
          {data.has_published_revision && (
            <Status domain="publication" status="published" label={t.editor.publicBadge} />
          )}
        </div>

        <div className="workshop-language-picker">
          <p className="label">{t.editor.contentLanguage}</p>
          <Tabs
            value={activeLocale}
            onChange={(locale) => {
              if (locale) selectLocale(locale as Locale);
            }}
            keepMounted={false}
          >
            <Tabs.List aria-label={t.editor.contentLanguage}>
              {translationStates.map(({ locale, added, state }) => {
                const stateLabel =
                  state === "ready"
                    ? t.editor.ready
                    : state === "partial"
                      ? t.editor.partial
                      : t.editor.empty;
                return (
                  <Tabs.Tab value={locale} key={locale}>
                    <span className="locale-code" aria-hidden="true">
                      {locale.toUpperCase()}
                    </span>
                    <span className="locale-copy">
                      <strong>{localeNames[locale]}</strong>
                      <small className={`locale-status ${state}`}>{stateLabel}</small>
                    </span>
                    {locale === "en" && !added && (
                      <span className="locale-add" aria-hidden="true">
                        +
                      </span>
                    )}
                  </Tabs.Tab>
                );
              })}
            </Tabs.List>

            <Tabs.Panel value={activeLocale} className="form-grid">
              <div className="field full">
                <label htmlFor={`workshop-title-${activeLocale}`}>{t.editor.title}</label>
                <FormInput
                  id={`workshop-title-${activeLocale}`}
                  type="text"
                  maxLength={240}
                  value={translation.title}
                  onChange={(event) => updateTranslation({ title: event.target.value })}
                />
              </div>
              <div className="field full">
                <label htmlFor={`workshop-summary-${activeLocale}`}>{t.editor.summary}</label>
                <FormTextarea
                  id={`workshop-summary-${activeLocale}`}
                  maxLength={800}
                  value={translation.summary}
                  onChange={(event) => updateTranslation({ summary: event.target.value })}
                />
              </div>
              <div className="field full">
                <label>{t.editor.body}</label>
                <LazyRichTextEditor
                  value={translation.body}
                  imageAlt={translation.title}
                  onChange={(body) => updateTranslation({ body })}
                />
              </div>
            </Tabs.Panel>
          </Tabs>
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
            <FormInput
              id="workshop-start"
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
            <FormInput
              id="workshop-end"
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
            <FormInput
              id="workshop-registration-url"
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
        {workshopId && (
          <Button
            type="button"
            className="destructive-action"
            color="red"
            disabled={busy}
            onClick={(event) => openDialog(removalAction, event.currentTarget)}
          >
            {confirmationCopy[removalAction].label}
          </Button>
        )}
        {data.has_published_revision && (
          <Button
            type="button"
            color="red"
            disabled={busy}
            onClick={(event) => openDialog("unpublish", event.currentTarget)}
          >
            {copy.unpublish}
          </Button>
        )}
        <Button
          type="button"
          variant="default"
          disabled={busy}
          ref={saveButton}
          onClick={() => void mutate("save")}
        >
          {pendingAction === "save" ? copy.saving : copy.saveDraft}
        </Button>
        {workshopId && (
          <Button
            type="button"
            disabled={busy}
            onClick={(event) => openDialog("publish", event.currentTarget)}
          >
            {copy.publish}
          </Button>
        )}
      </div>
      {dialog && (
        <ConfirmationDialog
          title={confirmationCopy[dialog].label}
          busy={busy}
          busyLabel={confirmationCopy[dialog].busyLabel}
          cancelLabel={copy.cancel}
          confirmLabel={confirmationCopy[dialog].label}
          danger={dialog !== "publish"}
          fallbackFocusRef={saveButton}
          returnFocusRef={dialogTrigger}
          onCancel={() => {
            if (!pendingMutation.current) setDialog(null);
          }}
          onConfirm={() => void mutate(dialog)}
        >
          <Text size="sm">{confirmationCopy[dialog].message}</Text>
          {dialog === "publish" && (
            <Stack component="dl" gap="xs" m={0}>
              <div>
                <Text component="dt" size="sm" fw={600}>
                  {copy.publishReady}
                </Text>
                <Text component="dd" size="sm" m={0}>
                  {readyLanguages.join(", ")}
                </Text>
              </div>
              <div>
                <Text component="dt" size="sm" fw={600}>
                  {copy.publishSkipped}
                </Text>
                <Text component="dd" size="sm" m={0}>
                  {skippedLanguages.join(", ") || copy.noSkippedTranslations}
                </Text>
              </div>
            </Stack>
          )}
        </ConfirmationDialog>
      )}
    </>
  );
}
