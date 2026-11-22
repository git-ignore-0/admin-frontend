import { adminDictionaries, type AdminLocale } from "@/lib/admin-i18n";
import {
  extendedRecords,
  initialRecords,
  recordCategories,
  recordStatuses,
  type SampleRecord,
} from "./sample-records";

const showcasePath = "/dev/ui-foundation";

export type SampleFilters = { category: string | null; status: string | null };
export type SampleRecordSet = "standard" | "single" | "many";
export type SampleNavigationContext = {
  tab: "navigation" | "list";
  query: string;
  filters: SampleFilters;
  page: number;
  recordSet: SampleRecordSet;
};
export type SampleSearchParams = Record<string, string | string[] | undefined>;

export const sampleEmptyFilters: SampleFilters = { category: null, status: null };
const defaultContext: SampleNavigationContext = {
  tab: "navigation",
  query: "",
  filters: sampleEmptyFilters,
  page: 1,
  recordSet: "standard",
};

export function findSampleNavigationRecord(id: string) {
  return (
    initialRecords.find((record) => record.id === id) ??
    extendedRecords.find((record) => record.id === id)
  );
}

export function isSampleRecordSet(value: string | null | undefined): value is SampleRecordSet {
  return value === "standard" || value === "single" || value === "many";
}

export function readSampleNavigationContext(
  get: (key: string) => string | null | undefined,
): SampleNavigationContext | undefined {
  const tab = get("review");
  if (tab !== "list" && tab !== "navigation") return undefined;
  if (tab === "navigation") return defaultContext;

  const category = get("category") ?? "";
  const status = get("status") ?? "";
  const page = Number(get("page"));
  const recordSet = get("records");
  return {
    tab,
    query: get("q")?.trim() ?? "",
    filters: {
      category: recordCategories.includes(category) ? category : null,
      status: Object.hasOwn(recordStatuses, status) ? status : null,
    },
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    recordSet: isSampleRecordSet(recordSet) ? recordSet : "standard",
  };
}

export function readSampleSearchParams(params?: SampleSearchParams) {
  return readSampleNavigationContext((key) => {
    const value = params?.[key];
    return typeof value === "string" ? value : undefined;
  });
}

function sampleNavigationQuery(context: SampleNavigationContext) {
  const params = new URLSearchParams({ review: context.tab });
  if (context.tab === "list") {
    if (context.query) params.set("q", context.query);
    if (context.filters.category) params.set("category", context.filters.category);
    if (context.filters.status) params.set("status", context.filters.status);
    if (context.page > 1) params.set("page", String(context.page));
    if (context.recordSet !== "standard") params.set("records", context.recordSet);
  }
  return `?${params.toString()}`;
}

export function sampleParentHref(context = defaultContext) {
  return showcasePath + sampleNavigationQuery(context);
}

type SampleNavigationOptions = { edit?: boolean; context?: SampleNavigationContext };

export function sampleNavigationPath(id: string, edit = false) {
  return `${showcasePath}/navigation/${encodeURIComponent(id)}${edit ? "/edit" : ""}`;
}

export function sampleNavigationHref(id: string, { edit, context }: SampleNavigationOptions = {}) {
  return sampleNavigationPath(id, edit) + (context ? sampleNavigationQuery(context) : "");
}

export function sampleNavigationBreadcrumbs(
  record: SampleRecord,
  locale: AdminLocale,
  { edit, context }: SampleNavigationOptions = {},
) {
  const { breadcrumb } = adminDictionaries[locale];
  const parent = {
    label: breadcrumb.uiFoundation,
    href: sampleParentHref(context),
  };
  return edit
    ? [
        parent,
        { label: record.name, href: sampleNavigationHref(record.id, { context }) },
        { label: breadcrumb.edit },
      ]
    : [parent, { label: record.name }];
}
