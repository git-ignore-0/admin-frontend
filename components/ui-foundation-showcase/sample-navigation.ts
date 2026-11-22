import { adminDictionaries, type AdminLocale } from "@/lib/admin-i18n";
import {
  extendedRecords,
  initialRecords,
  recordCategories,
  recordStatuses,
  type SampleRecord,
} from "./sample-records";

export const showcasePath = "/dev/ui-foundation";
const reviewTabs = ["color", "components", "toolbar", "list", "details", "navigation"] as const;
export type ShowcaseTab = (typeof reviewTabs)[number];

export type SampleFilters = { category: string | null; status: string | null };
export type SampleRecordSet = "standard" | "single" | "many";
export type SampleListContext = {
  query: string;
  filters: SampleFilters;
  page: number;
  recordSet: SampleRecordSet;
};
export type SampleNavigationContext = SampleListContext & { tab: ShowcaseTab };
export type SampleSearchParams = Record<string, string | string[] | undefined>;
type GetSearchParam = (key: string) => string | null | undefined;

export const sampleEmptyFilters: SampleFilters = { category: null, status: null };
export const defaultSampleListContext: SampleListContext = {
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

export function readShowcaseTab(value: string | null | undefined): ShowcaseTab | undefined {
  return reviewTabs.find((tab) => tab === value);
}

export function readSampleListContext(get: GetSearchParam): SampleListContext {
  const category = get("category") ?? "";
  const status = get("status") ?? "";
  const page = Number(get("page"));
  const recordSet = get("records");
  return {
    query: get("q")?.trim() ?? "",
    filters: {
      category: recordCategories.includes(category) ? category : null,
      status: Object.hasOwn(recordStatuses, status) ? status : null,
    },
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    recordSet: isSampleRecordSet(recordSet) ? recordSet : "standard",
  };
}

export function readSampleNavigationContext(
  get: GetSearchParam,
): SampleNavigationContext | undefined {
  const tab = readShowcaseTab(get("review"));
  return tab ? { ...readSampleListContext(get), tab } : undefined;
}

export function readSampleSearchParams(params?: SampleSearchParams) {
  return readSampleNavigationContext((key) => {
    const value = params?.[key];
    return Array.isArray(value) ? value[0] : value;
  });
}

export function setSampleListSearchParams(params: URLSearchParams, context: SampleListContext) {
  const values = {
    q: context.query,
    category: context.filters.category,
    status: context.filters.status,
    page: context.page > 1 ? String(context.page) : null,
    records: context.recordSet !== "standard" ? context.recordSet : null,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return params;
}

function sampleNavigationQuery(context: SampleNavigationContext) {
  return `?${setSampleListSearchParams(new URLSearchParams({ review: context.tab }), context)}`;
}

export function sampleParentHref(
  context: SampleNavigationContext = { ...defaultSampleListContext, tab: "navigation" },
) {
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
