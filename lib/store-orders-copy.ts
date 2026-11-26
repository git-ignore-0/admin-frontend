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
    description: "Theo dõi thanh toán, phân bổ nguồn Farm và xử lý giao hàng Store.",
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
    refresh: "Tải lại đơn và nguồn",
    refreshList: "Làm mới",
    allocationComplete: "Đủ {selected}/{required}",
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
    closeRefundReason: "Lý do xác minh không có tiền",
    closeRefundReasonRequired: "Hãy nhập lý do xác minh không có tiền.",
    restockPending: "Còn hàng chưa hoàn tồn",
    refundHint: "Hoàn tiền thủ công cho khách trước khi xác nhận tại đây.",
    staleSnapshot:
      "Dữ liệu đang hiển thị chưa được làm mới. Các thao tác tạm khóa đến khi tải lại thành công.",
    conflictReloadRequired:
      "Đơn hàng hoặc nguồn tồn đã thay đổi. Hãy tải trạng thái mới trước khi tiếp tục.",
    detailLoading: "Đang tải chi tiết đơn hàng…",
    recipientTitle: "Người nhận",
    phone: "Số điện thoại",
    address: "Địa chỉ",
    productsTitle: "Sản phẩm",
    productsSources: "Sản phẩm & nguồn hàng",
    paymentSummary: "Thanh toán",
    showDetails: "Xem chi tiết",
    hideDetails: "Thu gọn",
    historyToggle: "Xem lịch sử",
    allocationCheck: "Kiểm tra nguồn và số lượng trước khi duyệt.",
    quantity: "Số lượng",
    specification: "Quy cách",
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
    accountName: "Tên tài khoản",
    transferContent: "Nội dung chuyển khoản",
    timelineTitle: "Lịch sử xử lý",
    transferReportedAt: "Khách báo chuyển",
    paymentReceivedAt: "Admin ghi nhận tiền",
    approvedAt: "Duyệt lúc",
    deliveredAt: "Giao lúc",
    cancelledAt: "Hủy lúc",
    refundedAt: "Hoàn tiền lúc",
    cancellationReason: "Lý do hủy",
    reconciliationNote: "Ghi chú đối soát",
    refundNote: "Ghi chú hoàn tiền",
    paymentDeadline: "Hạn báo chuyển khoản",
    reviewDeadline: "Hạn duyệt đơn",
    remainingMinutes: "Còn {count} phút",
    expired: "Đã đến hạn; đang chờ trạng thái mới nhất từ backend.",
    allocationTitle: "Phân bổ nguồn Farm / batch",
    allocationHint: "Chọn nguồn và đủ số lượng cho từng sản phẩm.",
    source: "Nguồn",
    sourceQuantity: "Số lượng nguồn {count}",
    addSource: "Thêm nguồn",
    removeSource: "Xóa nguồn",
    selectedSummary: "Đã chọn {selected}/{required} · Còn thiếu {missing}",
    exceededSummary: "Đã chọn {selected}/{required} · Vượt {exceeded}",
    available: "còn {count}",
    sourceUnavailableOption: "Nguồn không còn khả dụng",
    sourceUnavailable: "Nguồn đã chọn không còn khả dụng.",
    sourceAvailabilityExceeded: "Nguồn chỉ còn {count}, thấp hơn số lượng đã chọn.",
    sourceDuplicate: "Nguồn này đã được chọn cho sản phẩm.",
    sourceQuantityInvalid: "Số lượng nguồn phải là số nguyên dương.",
    noSources: "Hiện không có nguồn khả dụng cho sản phẩm này.",
    reservations: "Giữ tồn cấp sản phẩm",
    reservationSummary: "Đơn này giữ {thisOrder} · đơn khác giữ {others}",
    allocatedSources: "Nguồn đã phân bổ",
    farmBatch: "Farm / batch",
    allocatedQuantity: "Đã phân bổ",
    restockStatus: "Hoàn tồn",
    restockLedger: "Đã hoàn {restocked} · Còn có thể hoàn {remaining}",
    actions: "Thao tác đơn hàng",
    actionLabels: {
      approve: "Duyệt đơn",
      cancel: "Hủy đơn",
      "record-payment": "Ghi nhận đã nhận tiền",
      "close-refund-request": "Xác minh không có tiền",
      refund: "Xác nhận hoàn tiền",
      deliver: "Xác nhận đã giao",
      restock: "Hoàn tồn",
    },
    actionTitles: {
      approve: "Duyệt toàn bộ đơn hàng",
      cancel: "Hủy đơn hàng",
      "record-payment": "Ghi nhận tiền đã về",
      "close-refund-request": "Kết thúc yêu cầu hoàn: không có tiền",
      refund: "Xác nhận đã hoàn tiền ngoài hệ thống",
      deliver: "Xác nhận khách đã nhận hàng",
      restock: "Hoàn tồn về batch",
    },
    cancelReason: "Lý do hủy",
    cancelReasonRequired: "Hãy nhập lý do hủy.",
    note: "Ghi chú đối soát",
    refundAmount: "Số tiền phải hoàn",
    refundNoteRequired: "Hãy nhập ghi chú hoàn tiền.",
    refundOutside: "Tôi xác nhận đã chuyển trả tiền ngoài hệ thống.",
    deliveredConfirm: "Tôi xác nhận khách đã nhận hàng.",
    restockQuantity: "Số lượng hoàn · {product} ({sku}) · {farm} · batch {batch}",
    restockBatch: "Batch {batch}",
    restockAllocation: "Đã phân bổ {allocated} · Đã hoàn {restocked} · Còn có thể hoàn {remaining}",
    restockInvalid: "Số lượng hoàn phải là số nguyên và không vượt lượng còn có thể hoàn.",
    approveAllocationInvalid: "Phải phân bổ đủ, không trùng và không vượt nguồn cho mọi sản phẩm.",
    mutationSuccess: "Đã cập nhật đơn hàng.",
    mutationUncertain:
      "Chưa xác định được kết quả. Nếu thử lại, hệ thống sẽ gửi lại đúng yêu cầu trước.",
    mutationConfirmedReload: "Đã xác nhận thao tác. Hãy tải lại trạng thái đơn trước khi tiếp tục.",
    saving: "Đang xử lý…",
    cancelButton: "Đóng",
    retryRequest: "Thử lại yêu cầu trước",
    conflict:
      "Đơn hàng hoặc nguồn tồn đã thay đổi. Draft được giữ; hãy tải lại và kiểm tra trước khi thử lại.",
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
    description: "Review payments, allocate Farm inventory, and manage Store delivery.",
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
    refresh: "Reload order and sources",
    refreshList: "Refresh",
    allocationComplete: "Complete {selected}/{required}",
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
    recipientTitle: "Recipient",
    phone: "Phone number",
    address: "Address",
    productsTitle: "Products",
    productsSources: "Products & sources",
    paymentSummary: "Payment",
    showDetails: "View details",
    hideDetails: "Collapse",
    historyToggle: "View history",
    allocationCheck: "Check sources and quantities before approving.",
    quantity: "Quantity",
    specification: "Specification",
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
    accountName: "Account name",
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
    remainingMinutes: "{count} minutes remaining",
    expired: "Deadline reached; waiting for the latest backend state.",
    allocationTitle: "Farm / batch allocation",
    allocationHint: "Select sources covering the quantity of each product.",
    source: "Source",
    sourceQuantity: "Source {count} quantity",
    addSource: "Add source",
    removeSource: "Remove source",
    selectedSummary: "Selected {selected}/{required} · Missing {missing}",
    exceededSummary: "Selected {selected}/{required} · Over by {exceeded}",
    available: "{count} available",
    sourceUnavailableOption: "Source no longer available",
    sourceUnavailable: "The selected source is no longer available.",
    sourceAvailabilityExceeded:
      "Only {count} remains in this source, less than the selected quantity.",
    sourceDuplicate: "This source is already selected for the product.",
    sourceQuantityInvalid: "Source quantity must be a positive whole number.",
    noSources: "There are currently no available sources for this product.",
    reservations: "Product-level reservations",
    reservationSummary: "This order reserves {thisOrder} · other orders reserve {others}",
    allocatedSources: "Allocated sources",
    farmBatch: "Farm / batch",
    allocatedQuantity: "Allocated",
    restockStatus: "Restock status",
    restockLedger: "Restocked {restocked} · {remaining} may still be restocked",
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
    refundOutside: "I confirm the refund was transferred outside this system.",
    deliveredConfirm: "I confirm the customer received the order.",
    restockQuantity: "Restock quantity · {product} ({sku}) · {farm} · batch {batch}",
    restockBatch: "Batch {batch}",
    restockAllocation:
      "Allocated {allocated} · Restocked {restocked} · {remaining} may still be restocked",
    restockInvalid: "Restock quantities must be whole numbers within the remaining limit.",
    approveAllocationInvalid:
      "Every product must be fully allocated without duplicates or exceeding stock.",
    mutationSuccess: "Order updated.",
    mutationUncertain: "The result is unconfirmed. Retrying will send the same request.",
    mutationConfirmedReload: "The action is confirmed. Reload the order before continuing.",
    saving: "Processing…",
    cancelButton: "Close",
    retryRequest: "Retry previous request",
    conflict:
      "The order or inventory sources changed. The draft was kept; reload and review before retrying.",
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
    farm_inactive: "Farm đã ngừng hoạt động.",
    fully_restocked: "Nguồn đã được hoàn tồn đầy đủ.",
    order_not_cancelled: "Chỉ hoàn tồn cho đơn đã hủy.",
    order_not_approved: "Đơn chưa trừ tồn tại Farm.",
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
