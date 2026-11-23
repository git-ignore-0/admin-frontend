import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import {
  csaRoundStatuses,
  csaConfigurationStatuses,
  type CSAConfigurationStatus,
  type CSARoundConfigurationType,
  type CSARoundStatus,
} from "@/lib/csa-rounds";

export const csaRoundListPath = "/csa-rounds";

export type RoundListQuery = {
  page?: string | string[];
  status?: string | string[];
  type?: string | string[];
  configurationId?: string | string[];
  occurrencePage?: string | string[];
  occurrenceStatus?: string | string[];
  occurrenceSearch?: string | string[];
};

export type RoundNavigationContext = {
  page: number;
  status: CSAConfigurationStatus | "";
  type: CSARoundConfigurationType | "";
  configurationId?: string;
  occurrencePage: number;
  occurrenceStatus: CSARoundStatus | "";
  occurrenceSearch: string;
};

export function normalizeOccurrenceSearch(value: string) {
  return Array.from(value.trim()).slice(0, 200).join("");
}

function readPage(value: string | undefined) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 && page <= 10_000 ? page : 1;
}

export function readRoundNavigationContext(
  query: RoundListQuery | Pick<URLSearchParams, "getAll"> | null,
): RoundNavigationContext {
  function value(key: keyof RoundListQuery) {
    if (query && "getAll" in query) {
      const values = query.getAll(key);
      return values.length === 1 ? values[0] : undefined;
    }
    const property = query?.[key];
    return typeof property === "string" ? property : undefined;
  }
  const configurationId = value("configurationId");
  const type = value("type");
  return {
    page: readPage(value("page")),
    status: csaConfigurationStatuses.find((status) => status === value("status")) ?? "",
    type: type === "weekly" || type === "standalone" ? type : "",
    configurationId:
      configurationId && UUID_PATH_SEGMENT.test(configurationId)
        ? configurationId.toLowerCase()
        : undefined,
    occurrencePage: readPage(value("occurrencePage")),
    occurrenceStatus: csaRoundStatuses.find((status) => status === value("occurrenceStatus")) ?? "",
    occurrenceSearch: normalizeOccurrenceSearch(value("occurrenceSearch") ?? ""),
  };
}

export function roundNavigationHref(path: string, context: Partial<RoundNavigationContext> = {}) {
  const {
    page = 1,
    status,
    type,
    configurationId,
    occurrencePage = 1,
    occurrenceStatus,
    occurrenceSearch,
  } = context;
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (page > 1) query.set("page", String(page));
  if (type) query.set("type", type);
  if (configurationId) query.set("configurationId", configurationId);
  if (occurrenceStatus) query.set("occurrenceStatus", occurrenceStatus);
  if (occurrencePage > 1) query.set("occurrencePage", String(occurrencePage));
  if (occurrenceSearch) query.set("occurrenceSearch", occurrenceSearch);
  return query.size ? `${path}?${query}` : path;
}

export function roundRecordPath(roundId: string, action?: "edit") {
  return `${csaRoundListPath}/${encodeURIComponent(roundId)}${action ? "/edit" : ""}`;
}

export function roundRecordHref(
  roundId: string,
  context: Partial<RoundNavigationContext>,
  rootId?: string | null,
  action?: "edit",
) {
  const { page, status, type, occurrencePage, occurrenceStatus, occurrenceSearch } = context;
  return roundNavigationHref(
    roundRecordPath(roundId, action),
    rootId
      ? {
          page,
          status,
          type,
          configurationId: rootId,
          occurrencePage,
          occurrenceStatus,
          occurrenceSearch,
        }
      : { page, status, type },
  );
}

export function roundConfigurationPath(rootId: string, action?: "edit") {
  return `${csaRoundListPath}/configurations/${encodeURIComponent(rootId)}${action ? "/edit" : ""}`;
}

export function roundConfigurationHref(
  context: Partial<RoundNavigationContext> | undefined,
  rootId: string,
  action?: "edit",
) {
  return roundNavigationHref(roundConfigurationPath(rootId, action), {
    ...context,
    configurationId: undefined,
  });
}
