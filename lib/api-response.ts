import type { ApiEnvelope } from "@/lib/client-api";
import { invalidApiResponse, isApiObject } from "@/lib/client-error";
import type { PaginationMeta } from "@/lib/types";

export function requireResponseList<T>(data: T[]): T[] {
  if (!Array.isArray(data)) throw invalidApiResponse();
  return data;
}

export function requireResponseEntity<T extends { id: string }>(data: T): T {
  if (!isApiObject(data) || typeof data.id !== "string" || !data.id) {
    throw invalidApiResponse();
  }
  return data;
}

function isPageNumber(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

export function requirePaginatedList<T, M extends PaginationMeta>(
  payload: ApiEnvelope<T[], M>,
): ApiEnvelope<T[], M> & { meta: M } {
  if (!isApiObject(payload)) throw invalidApiResponse();
  requireResponseList(payload.data);
  const { meta } = payload;
  if (
    !isApiObject(meta) ||
    !isPageNumber(meta.page, 1) ||
    !isPageNumber(meta.page_size, 1) ||
    !isPageNumber(meta.total, 0)
  ) {
    throw invalidApiResponse();
  }
  // The checks establish that the optional metadata is present without rebuilding the envelope.
  return payload as ApiEnvelope<T[], M> & { meta: M };
}
