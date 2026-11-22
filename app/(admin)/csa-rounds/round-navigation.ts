import { csaRoundStatuses, type CSARoundStatus } from "@/lib/csa-rounds";

export type RoundListQuery = {
  page?: string | string[];
  status?: string | string[];
};

export function readRoundListContext(query: RoundListQuery): {
  page: number;
  status: CSARoundStatus | "";
} {
  const page = typeof query.page === "string" ? Number(query.page) : 1;
  const status = csaRoundStatuses.find((value) => value === query.status) ?? "";
  return { page: Number.isSafeInteger(page) && page > 0 && page <= 10_000 ? page : 1, status };
}

export function roundPageHref(path = "/csa-rounds", page = 1, status?: CSARoundStatus | "") {
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (page > 1) query.set("page", String(page));
  return query.size ? `${path}?${query}` : path;
}
