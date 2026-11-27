import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { invalidApiResponse, isApiObject } from "@/lib/client-error";

export type CreationReceipt = { id: string; removed: boolean };

export function requireCreationReceipt(
  meta: unknown,
  key: string,
  action: "create_product" | "create_csa_configuration" | "create_farm_stock_batches",
) {
  const receipt = isApiObject(meta) ? meta.action_receipt : undefined;
  if (
    !isApiObject(receipt) ||
    receipt.action !== action ||
    typeof receipt.idempotency_key !== "string" ||
    receipt.idempotency_key.toLowerCase() !== key.toLowerCase() ||
    typeof receipt.resource_id !== "string" ||
    !UUID_PATH_SEGMENT.test(receipt.resource_id)
  )
    throw invalidApiResponse();
  return receipt.resource_id;
}
