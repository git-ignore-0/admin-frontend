import type { ApiEnvelope } from "@/lib/client-api";
import { invalidApiResponse, isApiObject } from "@/lib/client-error";
import type { PaginationMeta } from "@/lib/types";

export function requireResponseList<T>(data: T[], validateRecord?: (record: T) => void): T[] {
  if (!Array.isArray(data)) throw invalidApiResponse();
  if (validateRecord) for (const record of data) validateRecord(record);
  return data;
}

export function requireResponseEntity<T extends { id: string }>(data: T, expectedId?: string): T {
  if (
    !isApiObject(data) ||
    typeof data.id !== "string" ||
    !data.id.trim() ||
    (expectedId !== undefined && data.id.toLowerCase() !== expectedId.toLowerCase())
  ) {
    throw invalidApiResponse();
  }
  return data;
}

function isPageNumber(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

export function requirePaginatedList<T, M extends PaginationMeta>(
  payload: ApiEnvelope<T[], M>,
  validateRecord?: (record: T) => void,
  requestedPage?: number,
): ApiEnvelope<T[], M> & { meta: M } {
  if (!isApiObject(payload)) throw invalidApiResponse();
  requireResponseList(payload.data, validateRecord);
  const { meta } = payload;
  if (
    !isApiObject(meta) ||
    !isPageNumber(meta.page, 1) ||
    !isPageNumber(meta.page_size, 1) ||
    !isPageNumber(meta.total, 0) ||
    (requestedPage !== undefined && meta.page !== requestedPage) ||
    payload.data.length > meta.page_size
  ) {
    throw invalidApiResponse();
  }
  const identities = new Set<string>();
  for (const record of payload.data) {
    if (!isApiObject(record) || typeof record.id !== "string") continue;
    const id = record.id.toLowerCase();
    if (identities.has(id)) throw invalidApiResponse();
    identities.add(id);
  }
  // The checks establish that the optional metadata is present without rebuilding the envelope.
  return payload as ApiEnvelope<T[], M> & { meta: M };
}
