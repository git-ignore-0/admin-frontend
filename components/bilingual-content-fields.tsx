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
  busy,
  completionLabels,
  defaultLocale,
  descriptionLabel,
  languageLabels,
  longDescription,
  nameLabel,
  onChange,
  requireNames = true,
  descriptionMaxLength = 800,
  title,
  value,
}: {
  busy: boolean;
  completionLabels: { complete: string; incomplete: string };
  defaultLocale: AdminLocale;
  descriptionLabel: string;
  languageLabels: Record<AdminLocale, string>;
  longDescription?: LongDescriptionFields;
  nameLabel: string;
  onChange: (value: BilingualContentValue) => void;
  requireNames?: boolean;
  descriptionMaxLength?: number;
  title: string;
  value: BilingualContentValue;
}) {
  const id = useId();
  const [activeLocale, setActiveLocale] = useState<AdminLocale>(defaultLocale);
  const locales = ["vi", "en"] as const;

  function selectLocale(locale: AdminLocale) {
    setActiveLocale(locale);
  }

  function moveTab(event: React.KeyboardEvent<HTMLButtonElement>, locale: AdminLocale) {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const nextLocale = locale === "vi" ? "en" : "vi";
    selectLocale(nextLocale);
    document.getElementById(`${id}-${nextLocale}-tab`)?.focus();
  }

  const active = value[activeLocale];
  return (
    <section className="catalog-editor-section bilingual-content-editor">
      <h2>{title}</h2>
      <div aria-label={title} className="catalog-language-tabs" role="tablist">
        {locales.map((locale) => {
          const complete = Boolean(value[locale].name.trim());
          return (
            <button
              aria-controls={`${id}-${locale}-panel`}
              aria-selected={activeLocale === locale}
              className={activeLocale === locale ? "active" : ""}
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
        aria-labelledby={`${id}-${activeLocale}-tab`}
        className="catalog-language-panel form-grid"
        id={`${id}-${activeLocale}-panel`}
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
                [activeLocale]: { ...active, name: event.target.value },
              })
            }
            required={requireNames}
            value={active.name}
          />
        </label>
        <label className="field full">
          <span>{descriptionLabel}</span>
          <textarea
            className="textarea"
            disabled={busy}
            maxLength={descriptionMaxLength}
            onChange={(event) =>
              onChange({
                ...value,
                [activeLocale]: { ...active, description: event.target.value },
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
                  [activeLocale]: event.target.value,
                })
              }
              rows={7}
              value={longDescription.value[activeLocale]}
            />
          </label>
        )}
      </div>
    </section>
  );
}
