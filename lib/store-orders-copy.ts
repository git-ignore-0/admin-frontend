import type { AdminLocale } from "@/lib/admin-i18n";
import type { StoreOrderDisplayStatus } from "@/lib/store-orders";
import type {
  StoreOrder,
  StoreOrderAction,
  StoreOrderSort,
  StoreOrderStatus,
  StorePaymentStatus,
} from "@/lib/types";

const copy = {
  vi: {
    title: "Đơn hàng Store",
    back: "Danh sách đơn hàng",
    search: "Tìm đơn hàng",
    searchPlaceholder: "Mã đơn, tên hoặc số điện thoại",
    searchButton: "Tìm kiếm",
    searching: "Đang tìm…",
    orderStatus: "Trạng thái",
    paymentStatus: "Trạng thái tiền",
    sort: "Sắp xếp",
    all: "Tất cả",
    loading: "Đang tải đơn hàng…",
    empty: "Không có đơn hàng phù hợp.",
    reference: "Mã đơn",
    recipient: "Người nhận",
    total: "Tổng phải trả",
    createdAt: "Tạo lúc",
    deadline: "Hạn xử lý",
    csaBenefit: "Dùng điểm CSA",
    refresh: "Làm mới",
    refreshList: "Làm mới",
    refundPending: "Chờ hoàn",
    reconcile: "Xử lý đối soát",
    processRefund: "Xử lý hoàn tiền",
    reconciliationDecision: "Kết quả đối soát",
    reconciliationOpenedAt: "Mở đối soát lúc",
    reconciliationUnknown: "Chưa xác minh",
    paymentReceived: "Đã nhận tiền",
    paymentNotReceived: "Không nhận tiền",
    confirmReconciliation: "Xác nhận đối soát",
    refundRequestedAt: "Khách yêu cầu hoàn lúc",
    refundRequestClosedAt: "Kết thúc yêu cầu hoàn lúc",
    refundRequestClosedReason: "Lý do kết thúc yêu cầu hoàn",
    closeRefundReason: "Lý do xác nhận chưa nhận tiền",
    closeRefundReasonRequired: "Nhập lý do xác nhận chưa nhận tiền.",
    restockPending: "Còn hàng có thể hoàn tồn kho",
    refundHint: "Hoàn tiền thủ công cho khách trước khi xác nhận tại đây.",
    staleSnapshot:
      "Dữ liệu đang hiển thị chưa được làm mới. Các thao tác tạm khóa đến khi tải lại thành công.",
    conflictReloadRequired:
      "Đơn hàng hoặc nguồn tồn đã thay đổi. Hãy tải trạng thái mới trước khi tiếp tục.",
    detailLoading: "Đang tải chi tiết đơn hàng…",
    recipientTitle: "Người nhận và giao nhận",
    recipientName: "Họ tên người nhận",
    ward: "Phường/xã",
    province: "Tỉnh/thành phố",
    phone: "Số điện thoại",
    address: "Địa chỉ",
    productsTitle: "Sản phẩm",
    productSku: "Mã sản phẩm",
    sellingUnit: "Đơn vị bán",
    supplyingFarm: "Trang trại cung cấp",
    chooseFarm: "Chọn trang trại cung cấp.",
    chooseFarmPlaceholder: "Chọn trang trại",
    farmStock: "Còn {count}",
    farmIneligible: "Trang trại đã chọn không còn đáp ứng đủ số lượng. Vui lòng chọn lại.",
    farmUnavailable: "Trang trại đã chọn không còn khả dụng. Vui lòng chọn lại.",
    farmUnavailableOption: "Trang trại không còn khả dụng",
    noEligibleFarm: "Không có trang trại nào đáp ứng đủ số lượng sản phẩm này.",
    approveSourcesInvalid: "Kiểm tra trang trại cung cấp của từng sản phẩm.",
    detailPaymentStatus: "Trạng thái thanh toán",
    detailPaymentStatuses: {
      not_required: "Không cần chuyển khoản",
      unconfirmed: "Chưa xác nhận thanh toán",
      received: "Đã nhận tiền",
      refund_required: "Đã nhận tiền, cần hoàn tiền",
      refunded: "Đã hoàn tiền",
    } satisfies Record<StorePaymentStatus, string>,
    restockedQuantity: "Đã hoàn tồn kho {count}",
    restockableQuantity: "Có thể hoàn thêm {count}",
    fullyRestocked: "Đã hoàn tồn kho đầy đủ",
    restockUnavailable: "Không thể hoàn tồn kho",
    remainingLessThanMinute: "Còn dưới 1 phút",
    paymentSummary: "Thanh toán",
    quantity: "Số lượng",
    unitPrice: "Đơn giá",
    lineSubtotal: "Thành tiền",
    quotaUsage: "Quyền lợi CSA: {quantity} sản phẩm · {units} lượt",
    cashUsage: "Tiền mặt: {quantity} sản phẩm",
    listedSubtotal: "Tiền hàng",
    quotaCovered: "Điểm CSA",
    cashSubtotal: "Tạm tính tiền mặt",
    cashSubtotalBeforeDiscount: "Tiền mặt trước giảm giá",
    voucherCode: "Mã voucher",
    voucherDiscount: "Giảm giá voucher",
    deliveryDate: "Ngày giao",
    sourceRound: "Đợt CSA",
    sourceOrder: "Đơn CSA",
    shippingFee: "Phí giao hàng",
    shippingDiscount: "Lý do miễn phí giao hàng",
    transferTitle: "Thông tin chuyển khoản",
    bank: "Ngân hàng",
    account: "Số tài khoản",
    accountName: "Chủ tài khoản",
    transferContent: "Nội dung chuyển khoản",
    timelineTitle: "Lịch sử xử lý",
    transferReportedAt: "Khách báo đã chuyển khoản",
    paymentReceivedAt: "Đã xác nhận nhận tiền",
    approvedAt: "Duyệt lúc",
    deliveredAt: "Giao lúc",
    cancelledAt: "Hủy lúc",
    refundedAt: "Hoàn tiền lúc",
    cancellationReason: "Lý do hủy",
    reconciliationNote: "Ghi chú đối soát",
    refundNote: "Ghi chú hoàn tiền",
    paymentDeadline: "Hạn báo chuyển khoản",
    reviewDeadline: "Hạn duyệt đơn",
    expired: "Đã hết thời hạn xử lý",
    noAllocatedSources: "Chưa có nguồn đã phân bổ.",
    allocatedQuantity: "Đã phân bổ",
    actions: "Thao tác đơn hàng",
    actionLabels: {
      approve: "Duyệt đơn",
      cancel: "Hủy đơn",
      "record-payment": "Xác nhận đã nhận tiền",
      "close-refund-request": "Xác nhận chưa nhận tiền",
      refund: "Xác nhận hoàn tiền",
      deliver: "Xác nhận đã giao",
      restock: "Hoàn tồn kho",
    },
    actionTitles: {
      approve: "Duyệt toàn bộ đơn hàng",
      cancel: "Hủy đơn hàng",
      "record-payment": "Xác nhận đã nhận tiền",
      "close-refund-request": "Xác nhận chưa nhận tiền",
      refund: "Xác nhận đã hoàn tiền ngoài hệ thống",
      deliver: "Xác nhận khách đã nhận hàng",
      restock: "Hoàn tồn kho",
    },
    cancelReason: "Lý do hủy",
    cancelReasonRequired: "Hãy nhập lý do hủy.",
    note: "Ghi chú đối soát",
    refundAmount: "Số tiền phải hoàn",
    refundNoteRequired: "Hãy nhập ghi chú hoàn tiền.",
    actionTextTooLong: "Nội dung tối đa {max} ký tự.",
    actionTextInvalid: "Nội dung chứa ký tự không hợp lệ.",
    restockQuantityRange: "Nhập số nguyên từ 0 đến {max}.",
    refundOutside: "Tôi xác nhận đã chuyển trả tiền ngoài hệ thống.",
    deliveredConfirm: "Tôi xác nhận khách đã nhận hàng.",
    restockQuantity: "Số lượng hoàn · {product} ({sku}) · {farm} · đợt {batch}",
    restockBatch: "Đợt cung cấp {batch}",
    restockAllocation: "Đã phân bổ {allocated} · Đã hoàn tồn kho {restocked}",
    restockInvalid: "Số lượng hoàn phải là số nguyên và không vượt lượng còn có thể hoàn.",
    mutationSuccess: "Đã cập nhật đơn hàng.",
    mutationUncertain:
      "Chưa xác định được kết quả. Nếu thử lại, hệ thống sẽ gửi lại đúng yêu cầu trước.",
    approvalUncertain:
      "Chưa xác định được kết quả duyệt đơn. Nếu thử lại, hệ thống sẽ gửi lại đúng yêu cầu trước.",
    approvalSubmitting: "Đang gửi yêu cầu duyệt đơn",
    mutationConfirmedReload: "Đã xác nhận thao tác. Hãy tải lại trạng thái đơn trước khi tiếp tục.",
    saving: "Đang xử lý…",
    cancelButton: "Đóng",
    retryRequest: "Thử lại yêu cầu trước",
    conflict:
      "Đơn hàng hoặc tồn kho đã thay đổi. Hãy làm mới và kiểm tra lựa chọn trước khi thử lại.",
    mixedFarmConflict:
      "Yêu cầu trước chọn nhiều trang trại cho cùng một sản phẩm. Hãy làm mới rồi chọn một trang trại cho mỗi sản phẩm.",
    changedIntentConflict:
      "Yêu cầu không khớp với thao tác đã gửi. Hãy tải lại đơn và kiểm tra lịch sử trước khi tiếp tục.",
    reloadAfterConflict: "Tải trạng thái mới",
    shippingDiscountReasons: {
      csa_round: "Giao hàng trong gói CSA",
      csa_companion_delivery: "Miễn phí giao kèm CSA",
      active_csa_with_csa_product: "Thành viên CSA mua sản phẩm CSA",
    },
    cancellationReasons: {
      reselection_expired: "Đã hết hạn chọn lại sản phẩm",
      expired: "Đơn hết hạn trước khi được duyệt",
      buyer_cancelled: "Khách đã hủy đơn",
      delivery_date_expired: "Quá ngày giao hàng",
      payment_expired: "Quá hạn thanh toán",
      payment_review_expired: "Quá hạn xác nhận thanh toán",
    },
    statuses: {
      payment_pending: "Chờ thanh toán",
      pending_review: "Chờ xác nhận đơn",
      payment_review: "Chờ xác nhận thanh toán",
      pending_delivery: "Chờ giao",
      delivered: "Đã giao",
      cancelled: "Đã hủy",
    } satisfies Record<StoreOrderStatus, string>,
    paymentStatuses: {
      not_required: "Không cần chuyển khoản",
      unconfirmed: "Chưa xác nhận tiền",
      received: "Đã nhận tiền",
      refund_required: "Đã nhận tiền, cần hoàn",
      refunded: "Đã hoàn tiền",
    } satisfies Record<StorePaymentStatus, string>,
    sorts: {
      created_desc: "Mới nhất",
      created_asc: "Cũ nhất",
      deadline_asc: "Hạn gần nhất",
      total_desc: "Tổng tiền cao nhất",
    } satisfies Record<StoreOrderSort, string>,
  },
  en: {
    title: "Store orders",
    back: "Store orders",
    search: "Search orders",
    searchPlaceholder: "Order code, recipient, or phone",
    searchButton: "Search",
    searching: "Searching…",
    orderStatus: "Status",
    paymentStatus: "Payment status",
    sort: "Sort",
    all: "All",
    loading: "Loading Store orders…",
    empty: "No matching Store orders.",
    reference: "Order code",
    recipient: "Recipient",
    total: "Amount due",
    createdAt: "Created",
    deadline: "Deadline",
    csaBenefit: "CSA points",
    refresh: "Refresh",
    refreshList: "Refresh",
    refundPending: "Awaiting refund",
    reconcile: "Reconcile payment",
    processRefund: "Process refund",
    reconciliationDecision: "Reconciliation result",
    reconciliationOpenedAt: "Reconciliation opened",
    reconciliationUnknown: "Not yet verified",
    paymentReceived: "Payment received",
    paymentNotReceived: "No payment received",
    confirmReconciliation: "Confirm reconciliation",
    refundRequestedAt: "Refund requested",
    refundRequestClosedAt: "Refund request closed",
    refundRequestClosedReason: "Refund request closure reason",
    closeRefundReason: "Reason for no received payment",
    closeRefundReasonRequired: "Enter the reason for confirming no payment was received.",
    restockPending: "Stock still needs to be returned",
    refundHint: "Refund the customer manually before confirming here.",
    staleSnapshot:
      "The displayed data has not been refreshed. Actions are locked until reloading succeeds.",
    conflictReloadRequired:
      "The order or inventory sources changed. Load the latest state before continuing.",
    detailLoading: "Loading order details…",
    recipientTitle: "Recipient & delivery",
    recipientName: "Recipient name",
    ward: "Ward/commune",
    province: "Province/city",
    phone: "Phone number",
    address: "Address",
    productsTitle: "Products",
    productSku: "Product code",
    sellingUnit: "Selling unit",
    supplyingFarm: "Supplying farm",
    chooseFarm: "Select a supplying farm.",
    chooseFarmPlaceholder: "Select a farm",
    farmStock: "{count} available",
    farmIneligible: "The selected farm can no longer fulfill the quantity. Select another farm.",
    farmUnavailable: "The selected farm is no longer available. Select another farm.",
    farmUnavailableOption: "Farm no longer available",
    noEligibleFarm: "No farm can fulfill the required quantity for this product.",
    approveSourcesInvalid: "Check the supplying farm for each product.",
    detailPaymentStatus: "Payment status",
    detailPaymentStatuses: {
      not_required: "No bank transfer required",
      unconfirmed: "Payment not confirmed",
      received: "Payment received",
      refund_required: "Payment received, refund required",
      refunded: "Refunded",
    } satisfies Record<StorePaymentStatus, string>,
    restockedQuantity: "Restocked {count}",
    restockableQuantity: "{count} can still be restocked",
    fullyRestocked: "Fully restocked",
    restockUnavailable: "Cannot restock",
    remainingLessThanMinute: "Less than 1 minute remaining",
    paymentSummary: "Payment",
    quantity: "Quantity",
    unitPrice: "Unit price",
    lineSubtotal: "Line subtotal",
    quotaUsage: "CSA benefits: {quantity} items · {units} units",
    cashUsage: "Cash: {quantity} items",
    listedSubtotal: "Listed product value",
    quotaCovered: "CSA points",
    cashSubtotal: "Cash subtotal",
    cashSubtotalBeforeDiscount: "Cash subtotal before discount",
    voucherCode: "Voucher code",
    voucherDiscount: "Voucher discount",
    deliveryDate: "Delivery date",
    sourceRound: "CSA round",
    sourceOrder: "CSA order",
    shippingFee: "Delivery fee",
    shippingDiscount: "Free-delivery reason",
    transferTitle: "Bank transfer details",
    bank: "Bank",
    account: "Account number",
    accountName: "Account holder",
    transferContent: "Transfer content",
    timelineTitle: "Order history",
    transferReportedAt: "Customer reported transfer",
    paymentReceivedAt: "Payment recorded",
    approvedAt: "Approved",
    deliveredAt: "Delivered",
    cancelledAt: "Cancelled",
    refundedAt: "Refunded",
    cancellationReason: "Cancellation reason",
    reconciliationNote: "Reconciliation note",
    refundNote: "Refund note",
    paymentDeadline: "Transfer-report deadline",
    reviewDeadline: "Review deadline",
    expired: "Processing deadline passed",
    noAllocatedSources: "No sources allocated.",
    allocatedQuantity: "Allocated",
    actions: "Order actions",
    actionLabels: {
      approve: "Approve order",
      cancel: "Cancel order",
      "record-payment": "Record payment",
      "close-refund-request": "Confirm no payment received",
      refund: "Record refund",
      deliver: "Mark delivered",
      restock: "Restock",
    },
    actionTitles: {
      approve: "Approve the full order",
      cancel: "Cancel order",
      "record-payment": "Record received payment",
      "close-refund-request": "Close refund request: no payment received",
      refund: "Confirm the external refund",
      deliver: "Confirm customer receipt",
      restock: "Restock batches",
    },
    cancelReason: "Cancellation reason",
    cancelReasonRequired: "Enter a cancellation reason.",
    note: "Reconciliation note",
    refundAmount: "Amount to refund",
    refundNoteRequired: "Enter a refund note.",
    actionTextTooLong: "Enter at most {max} characters.",
    actionTextInvalid: "The text contains an unsupported character.",
    restockQuantityRange: "Enter a whole number from 0 to {max}.",
    refundOutside: "I confirm the refund was transferred outside this system.",
    deliveredConfirm: "I confirm the customer received the order.",
    restockQuantity: "Restock quantity · {product} ({sku}) · batch {batch}",
    restockBatch: "Supply batch {batch}",
    restockAllocation: "Allocated {allocated} · Restocked {restocked}",
    restockInvalid: "Restock quantities must be whole numbers within the remaining limit.",
    mutationSuccess: "Order updated.",
    mutationUncertain: "The result is unconfirmed. Retrying will send the same request.",
    approvalUncertain: "The approval result is unconfirmed. Retrying will send the same request.",
    approvalSubmitting: "Submitting approval",
    mutationConfirmedReload: "The action is confirmed. Reload the order before continuing.",
    saving: "Processing…",
    cancelButton: "Close",
    retryRequest: "Retry previous request",
    conflict:
      "The order or inventory sources changed. The draft was kept; reload and review before retrying.",
    mixedFarmConflict:
      "The previous request selected multiple farms for one product. Reload and select one farm per product.",
    changedIntentConflict:
      "The request differs from the submitted action. Reload the order and review its history before continuing.",
    reloadAfterConflict: "Load latest state",
    shippingDiscountReasons: {
      csa_round: "Delivery included in CSA",
      csa_companion_delivery: "Free delivery with CSA",
      active_csa_with_csa_product: "CSA member purchasing a CSA product",
    },
    cancellationReasons: {
      reselection_expired: "Reselection deadline expired",
      expired: "Order expired before approval",
      buyer_cancelled: "Cancelled by the customer",
      delivery_date_expired: "Delivery date expired",
      payment_expired: "Payment deadline expired",
      payment_review_expired: "Payment confirmation deadline expired",
    },
    statuses: {
      payment_pending: "Awaiting payment",
      pending_review: "Awaiting order confirmation",
      payment_review: "Awaiting payment confirmation",
      pending_delivery: "Pending delivery",
      delivered: "Delivered",
      cancelled: "Cancelled",
    } satisfies Record<StoreOrderStatus, string>,
    paymentStatuses: {
      not_required: "No bank payment required",
      unconfirmed: "Payment unconfirmed",
      received: "Payment received",
      refund_required: "Received, refund required",
      refunded: "Refunded",
    } satisfies Record<StorePaymentStatus, string>,
    sorts: {
      created_desc: "Newest first",
      created_asc: "Oldest first",
      deadline_asc: "Nearest deadline",
      total_desc: "Highest total",
    } satisfies Record<StoreOrderSort, string>,
  },
} as const;

export function storeOrdersCopy(locale: AdminLocale) {
  return copy[locale];
}

export function storeOrderConflictMessage(code: string | undefined, locale: AdminLocale) {
  const labels = storeOrdersCopy(locale);
  if (code === "store_allocation_mixed_farm") return labels.mixedFarmConflict;
  if (code === "store_idempotency_conflict") return labels.changedIntentConflict;
  return labels.conflict;
}

export function storeOrderStatusLabel(
  status: StoreOrderDisplayStatus,
  locale: AdminLocale,
  order?: Pick<StoreOrder, "workflow_version" | "csa">,
) {
  if (status === "pending_review" && order?.workflow_version === 1) {
    return locale === "vi" ? "Chờ duyệt" : "Pending review";
  }
  return storeOrdersCopy(locale).statuses[status];
}

export function storeRefundStatusLabel(
  status: StoreOrder["refund_status"],
  locale: AdminLocale,
  order?: Pick<StoreOrder, "workflow_version" | "csa" | "payment_status">,
) {
  if (
    status === "pending" &&
    order?.workflow_version === 2 &&
    !order.csa &&
    order.payment_status === "unconfirmed"
  )
    return locale === "vi" ? "Chờ đối soát" : "Awaiting reconciliation";
  if (status === "pending") return locale === "vi" ? "Chờ hoàn" : "Awaiting refund";
  if (status === "refunded") return locale === "vi" ? "Đã hoàn" : "Refunded";
  return "";
}

export function storeOrderActionLabel(
  order: StoreOrder,
  action: StoreOrderAction,
  locale: AdminLocale,
) {
  if (
    order.workflow_version === 2 &&
    !order.csa &&
    order.status === "cancelled" &&
    order.refund_status === "pending"
  ) {
    if (action === "record-payment") return storeOrdersCopy(locale).reconcile;
    if (action === "refund") return storeOrdersCopy(locale).processRefund;
  }
  if (action === "approve" && order.workflow_version === 2 && !order.csa) {
    return locale === "vi" ? "Xác nhận đủ hàng" : "Confirm all goods";
  }
  return storeOrdersCopy(locale).actionLabels[action];
}

export function storeOrderActionTitle(
  order: StoreOrder,
  action: StoreOrderAction,
  locale: AdminLocale,
) {
  if (action === "approve" && order.workflow_version === 2 && !order.csa) {
    return locale === "vi" ? "Xác nhận đủ toàn bộ hàng" : "Confirm all goods are available";
  }
  return storeOrdersCopy(locale).actionTitles[action];
}

export function storeOrderDeadlineLabel(
  order: Pick<StoreOrder, "workflow_version" | "status" | "csa">,
  locale: AdminLocale,
) {
  if (order.workflow_version === 2 && !order.csa) {
    if (order.status === "pending_review")
      return locale === "vi" ? "Hạn xác nhận đơn" : "Order confirmation deadline";
    if (order.status === "payment_review")
      return locale === "vi" ? "Hạn xác nhận thanh toán" : "Payment confirmation deadline";
    return locale === "vi" ? "Hạn thanh toán" : "Payment deadline";
  }
  return order.status === "payment_pending"
    ? storeOrdersCopy(locale).paymentDeadline
    : storeOrdersCopy(locale).reviewDeadline;
}

export function storeOrderCountdown(remaining: number | null, locale: AdminLocale) {
  if (remaining === null) return "";
  const c = storeOrdersCopy(locale);
  if (remaining <= 0) return c.expired;
  if (remaining < 60_000) return c.remainingLessThanMinute;
  const minutes = Math.ceil(remaining / 60_000);
  const parts = [
    [Math.floor(minutes / 1440), "ngày", "day"],
    [Math.floor((minutes % 1440) / 60), "giờ", "hour"],
    [minutes % 60, "phút", "minute"],
  ] as const;
  const duration = parts
    .filter(([count]) => count > 0)
    .map(([count, vi, en]) => `${count} ${locale === "vi" ? vi : count === 1 ? en : `${en}s`}`)
    .join(" ");
  return locale === "vi" ? `Còn ${duration}` : `${duration} remaining`;
}

function translatedReason(reasons: Record<string, string>, reason: string): string {
  return Object.prototype.hasOwnProperty.call(reasons, reason) ? reasons[reason] : reason;
}

export function storeShippingDiscountReason(reason: string, locale: AdminLocale) {
  const reasons = copy[locale].shippingDiscountReasons as Record<string, string>;
  return translatedReason(reasons, reason);
}

export function storeCancellationReason(reason: string, locale: AdminLocale) {
  const reasons = copy[locale].cancellationReasons as Record<string, string>;
  return translatedReason(reasons, reason);
}

const restockReasons = {
  vi: {
    batch_expired: "Nguồn đã hết hạn, không thể hoàn tồn.",
    batch_not_started: "Nguồn chưa đến ngày áp dụng.",
    batch_cancelled: "Nguồn đã bị hủy, không thể hoàn tồn.",
    offer_inactive: "Nguồn cung đã được gỡ khỏi trang trại.",
    batch_historical: "Đợt cung cấp thuộc lịch sử, không thể hoàn tồn vào nguồn hiện tại.",
    farm_inactive: "Trang trại đã ngừng hoạt động.",
    fully_restocked: "Nguồn đã được hoàn tồn đầy đủ.",
    order_not_cancelled: "Chỉ hoàn tồn cho đơn đã hủy.",
    order_not_approved: "Đơn chưa trừ tồn kho tại trang trại.",
  },
  en: {
    batch_expired: "This source has expired and cannot be restocked.",
    batch_not_started: "This source is not active yet.",
    batch_cancelled: "This source was cancelled and cannot be restocked.",
    offer_inactive: "This source was removed from the farm.",
    batch_historical: "This is a historical batch and cannot be restocked into the current supply.",
    farm_inactive: "This Farm is inactive.",
    fully_restocked: "This source has already been fully restocked.",
    order_not_cancelled: "Only cancelled orders can be restocked.",
    order_not_approved: "This order has not deducted Farm stock.",
  },
};
export function storeRestockUnavailableReason(reason: string | null, locale: AdminLocale) {
  const reasons = restockReasons[locale] as Record<string, string>;
  return reason
    ? translatedReason(reasons, reason)
    : locale === "vi"
      ? "Nguồn không còn khả dụng để hoàn tồn."
      : "This source cannot be restocked.";
}
