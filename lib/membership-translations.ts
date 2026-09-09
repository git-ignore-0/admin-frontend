import type { AdminLocale } from "@/lib/admin-i18n";

type NamedTranslation = { locale: AdminLocale; name: string };

export function localizedCatalogTranslation<T extends NamedTranslation>(
  translations: T[],
  locale: AdminLocale,
) {
  return (
    translations.find((item) => item.locale === locale && item.name.trim()) ??
    translations.find((item) => item.locale === "vi" && item.name.trim()) ??
    null
  );
}

export function hasCompleteCatalogTranslations(translations: NamedTranslation[]) {
  return (["vi", "en"] as const).every((locale) =>
    translations.some((item) => item.locale === locale && item.name.trim()),
  );
}
