"use client";

import { useId, useState } from "react";

import type { AdminLocale } from "@/lib/admin-i18n";

export type BilingualContentValue = Record<AdminLocale, { name: string; description: string }>;

export const emptyBilingualContent = (): BilingualContentValue => ({
  vi: { name: "", description: "" },
  en: { name: "", description: "" },
});

type LongDescriptionFields = {
  label: string;
  maxLength?: number;
  onChange: (value: Record<AdminLocale, string>) => void;
  value: Record<AdminLocale, string>;
};

export function BilingualContentFields({
  activeLocale,
  busy,
  completionLabels,
  defaultLocale,
  descriptionLabel,
  isLocaleComplete,
  languageLabels,
  longDescription,
  nameLabel,
  onChange,
  onLocaleChange,
  renderAfterName,
  requireNames = true,
  descriptionMaxLength = 800,
  title,
  value,
}: {
  activeLocale?: AdminLocale;
  busy: boolean;
  completionLabels: { complete: string; incomplete: string };
  defaultLocale: AdminLocale;
  descriptionLabel: string;
  isLocaleComplete?: (locale: AdminLocale) => boolean;
  languageLabels: Record<AdminLocale, string>;
  longDescription?: LongDescriptionFields;
  nameLabel: string;
  onChange: (value: BilingualContentValue) => void;
  onLocaleChange?: (locale: AdminLocale) => void;
  renderAfterName?: (locale: AdminLocale) => React.ReactNode;
  requireNames?: boolean;
  descriptionMaxLength?: number;
  title: string;
  value: BilingualContentValue;
}) {
  const id = useId();
  const [internalLocale, setInternalLocale] = useState<AdminLocale>(defaultLocale);
  const currentLocale = activeLocale ?? internalLocale;
  const locales = ["vi", "en"] as const;

  function selectLocale(locale: AdminLocale) {
    setInternalLocale(locale);
    onLocaleChange?.(locale);
  }

  function moveTab(event: React.KeyboardEvent<HTMLButtonElement>, locale: AdminLocale) {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const nextLocale = locale === "vi" ? "en" : "vi";
    selectLocale(nextLocale);
    document.getElementById(`${id}-${nextLocale}-tab`)?.focus();
  }

  const active = value[currentLocale];
  return (
    <section className="catalog-editor-section bilingual-content-editor">
      <h2>{title}</h2>
      <div aria-label={title} className="catalog-language-tabs" role="tablist">
        {locales.map((locale) => {
          const complete = isLocaleComplete
            ? isLocaleComplete(locale)
            : Boolean(value[locale].name.trim());
          return (
            <button
              aria-controls={`${id}-${locale}-panel`}
              aria-selected={currentLocale === locale}
              className={currentLocale === locale ? "active" : ""}
              disabled={busy}
              id={`${id}-${locale}-tab`}
              key={locale}
              onClick={() => selectLocale(locale)}
              onKeyDown={(event) => moveTab(event, locale)}
              role="tab"
              type="button"
            >
              <span>{languageLabels[locale]}</span>
              <small className={complete ? "complete" : "incomplete"}>
                {complete ? completionLabels.complete : completionLabels.incomplete}
              </small>
            </button>
          );
        })}
      </div>
      <div
        aria-labelledby={`${id}-${currentLocale}-tab`}
        className="catalog-language-panel form-grid"
        id={`${id}-${currentLocale}-panel`}
        role="tabpanel"
      >
        <label className="field full">
          <span>
            {nameLabel}
            {requireNames ? " *" : ""}
          </span>
          <input
            className="input"
            disabled={busy}
            maxLength={200}
            onChange={(event) =>
              onChange({
                ...value,
                [currentLocale]: { ...active, name: event.target.value },
              })
            }
            required={requireNames}
            value={active.name}
          />
        </label>
        {renderAfterName?.(currentLocale)}
        <label className="field full">
          <span>{descriptionLabel}</span>
          <textarea
            className="textarea"
            disabled={busy}
            maxLength={descriptionMaxLength}
            onChange={(event) =>
              onChange({
                ...value,
                [currentLocale]: { ...active, description: event.target.value },
              })
            }
            value={active.description}
          />
        </label>
        {longDescription && (
          <label className="field full">
            <span>{longDescription.label}</span>
            <textarea
              className="textarea"
              disabled={busy}
              maxLength={longDescription.maxLength}
              onChange={(event) =>
                longDescription.onChange({
                  ...longDescription.value,
                  [currentLocale]: event.target.value,
                })
              }
              rows={7}
              value={longDescription.value[currentLocale]}
            />
          </label>
        )}
      </div>
    </section>
  );
}
