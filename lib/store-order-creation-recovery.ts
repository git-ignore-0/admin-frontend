import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { isApiObject } from "@/lib/client-error";

export type StoreOrderRecovery = {
  key: string;
  orderId?: string;
  conflictingKey?: true;
};

export const STORE_ORDER_RECOVERY_CHANGED = "nfv-admin-store-order-recovery-changed";

export function storeOrderRecoverySlot() {
  const scope = document.querySelector<HTMLElement>("[data-admin-order-recovery]")?.dataset
    .adminOrderRecovery;
  return scope ? `nfv-admin-store-order-recovery:v1:${scope}` : null;
}

export function readStoreOrderRecovery(slot: string): StoreOrderRecovery | null {
  const raw = window.localStorage.getItem(slot);
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("store_recovery_corrupt");
  }
  if (
    !isApiObject(value) ||
    Object.keys(value).some((field) => !["key", "orderId", "conflictingKey"].includes(field)) ||
    typeof value.key !== "string" ||
    !UUID_PATH_SEGMENT.test(value.key) ||
    (value.orderId !== undefined &&
      (typeof value.orderId !== "string" || !UUID_PATH_SEGMENT.test(value.orderId))) ||
    (value.conflictingKey !== undefined && value.conflictingKey !== true)
  ) {
    throw new Error("store_recovery_corrupt");
  }
  return {
    key: value.key.toLowerCase(),
    ...(typeof value.orderId === "string" ? { orderId: value.orderId.toLowerCase() } : {}),
    ...(value.conflictingKey === true ? { conflictingKey: true } : {}),
  };
}

export function updateStoreOrderRecovery(
  slot: string,
  update: (previous: StoreOrderRecovery | null) => StoreOrderRecovery | null,
) {
  // The lock only guards the local read/modify/write. Django arbitrates the actual mutation.
  return navigator.locks.request(slot, () => {
    const previous = readStoreOrderRecovery(slot);
    const next = update(previous);
    if (next !== previous) {
      if (next) window.localStorage.setItem(slot, JSON.stringify(next));
      else window.localStorage.removeItem(slot);
      // Native storage events go to other documents only.
      window.dispatchEvent(new Event(STORE_ORDER_RECOVERY_CHANGED));
    }
    return next;
  });
}
