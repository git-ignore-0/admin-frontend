import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { selectOption } from "./select-option";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { CSAPurchaseRequestDetail } from "@/components/csa-purchase-request-detail";
import { CSAPurchaseRequestList } from "@/components/csa-purchase-request-list";
import { MembershipPaymentSettingsForm } from "@/components/membership-payment-settings-form";
import { ToastProvider } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import type { CSAPurchaseRequest, MembershipPaymentSettings, PaginationMeta } from "@/lib/types";

const navigation = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  const subscribe = (notify: () => void) => {
    window.addEventListener("popstate", notify);
    return () => window.removeEventListener("popstate", notify);
  };
  return {
    useRouter: () => ({ push: navigation.push, refresh: vi.fn() }),
    usePathname: () => "/csa-purchase-requests",
    useSearchParams: () => {
      const search = useSyncExternalStore(subscribe, () => window.location.search);
      return useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

beforeEach(() => {
  window.history.replaceState(null, "", "/csa-purchase-requests");
  navigation.prefetch.mockResolvedValue(undefined);
  const replaceState = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, "replaceState").mockImplementation((data, unused, url) => {
    replaceState(data, unused, url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const request: CSAPurchaseRequest = {
  id: "24803641-2dce-4cac-8fc4-91e55f03e95f",
  request_code: "CSA-20260910-ABC",
  status: "payment_confirmed",
  user: null,
  customer_id: null,
  membership_id: null,
  name: "Nguyễn Văn An",
  phone: "+84901234567",
  province_code: "66",
  ward_code: "22015",
  address: "Số 12, ngõ 5",
  package_snapshot: { id: "package-id", name: "Gói rau mùa" },
  price_option_snapshot: { id: "option-id", name: "3 tháng", duration_months: 3 },
  amount: "1200000",
  currency: "VND",
  transfer_content: "CSAABC123",
  bank_bin: "970436",
  bank_name: "Vietcombank",
  account_number: "123456789",
  account_name: "NFV",
  payment_config_version: 2,
  expires_at: "2026-09-17T01:00:00Z",
  expired_at: null,
  expired_reason: null,
  payment_confirmed_at: "2026-09-10T02:00:00Z",
  approved_at: null,
  rejected_at: null,
  approved_by: null,
  rejected_by: null,
  rejection_reason: "",
  refund_status: "not_applicable",
  refund_marked_at: null,
  refund_marked_by: null,
  refund_note: null,
  created_at: "2026-09-10T01:00:00Z",
  updated_at: "2026-09-10T02:00:00Z",
};

const installmentRequest: CSAPurchaseRequest = {
  ...request,
  status: "approved",
  membership_id: "87703641-2dce-4cac-8fc4-91e55f03e95f",
  payment_plan: {
    id: "plan-id",
    name: "Trả góp 3 lần",
    payment_type: "installment",
    total_amount: "1200000",
    installment_count: 3,
    initial_payment_amount: "400000",
    installments: [
      { sequence: 1, amount: "400000", cycle_count: 1 },
      { sequence: 2, amount: "400000", cycle_count: 1 },
      { sequence: 3, amount: "400000", cycle_count: 1 },
    ],
  },
  payment_summary: {
    total_amount: "1200000",
    paid_amount: "400000",
    remaining_amount: "800000",
    confirmed_installments: 1,
    installment_count: 3,
    paid_cycles: 1,
    total_cycles: 3,
  },
  payments: [
    {
      id: "payment-3",
      installment_sequence: 3,
      amount_due: "400000",
      amount_paid: null,
      cycle_count: 1,
      status: "overdue",
      due_at: "2026-12-01T18:00:00Z",
      confirmed_at: null,
      confirmed_by: null,
      rejected_at: null,
      rejection_reason: null,
      note: "",
    },
    {
      id: "payment-1",
      installment_sequence: 1,
      amount_due: "400000",
      amount_paid: "400000",
      cycle_count: 1,
      status: "confirmed",
      due_at: "2026-10-01T18:00:00Z",
      confirmed_at: "2026-10-02T01:00:00Z",
      confirmed_by: { id: "admin-id", name: "Admin A" },
      rejected_at: null,
      rejection_reason: null,
      note: "Đã đối soát",
    },
    {
      id: "payment-2",
      installment_sequence: 2,
      amount_due: "400000",
      amount_paid: null,
      cycle_count: 1,
      status: "reported",
      due_at: "2026-11-01T18:00:00Z",
      confirmed_at: null,
      confirmed_by: null,
      rejected_at: null,
      rejection_reason: null,
      note: "",
    },
  ],
};

function renderWithProviders(node: React.ReactNode, locale: "vi" | "en" = "vi") {
  return render(
    <RouterContext.Provider value={navigation as unknown as NextRouter}>
      <AdminI18nProvider initialLocale={locale}>
        <ToastProvider>{node}</ToastProvider>
      </AdminI18nProvider>
    </RouterContext.Provider>,
  );
}

function mockDetailApi(item = request) {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === `admin/csa-purchase-requests/${item.id}`) return item as never;
    if (path === "administrative-units/provinces")
      return [{ code: "66", name: "Đồng Tháp" }] as never;
    if (path.startsWith("administrative-units/wards"))
      return [{ code: "22015", name: "Cao Lãnh" }] as never;
    throw new Error(`unexpected:${path}`);
  });
}

describe("CSA purchase request admin", () => {
  it("returns from the detail breadcrumb to the filtered purchase list", async () => {
    const list = "/csa-purchase-requests";
    const detail = `${list}/${request.id}`;
    const search = "?search=Lan&status=payment_confirmed&page=2";
    window.history.replaceState(null, "", detail + search);
    mockDetailApi();

    function BreadcrumbLink() {
      const [item] = useAdminBreadcrumbs([{ label: "Purchase list", href: list }]);
      return <a href={item.href}>Purchase list</a>;
    }

    renderWithProviders(
      <AdminBreadcrumbProvider pathname={detail} search={search}>
        <BreadcrumbLink />
        <CSAPurchaseRequestDetail requestId={request.id} backHref={list + search} />
      </AdminBreadcrumbProvider>,
    );
    expect(screen.getByRole("link", { name: "Purchase list" })).toHaveAttribute(
      "href",
      list + search,
    );
    await screen.findByText(request.request_code);
  });

  it("shows full payment without adding a list column or installment actions", async () => {
    const fullRequest: CSAPurchaseRequest = {
      ...request,
      payment_plan: {
        id: "full-plan",
        name: "Trả thẳng",
        payment_type: "full",
        total_amount: "1200000",
        installment_count: 1,
        initial_payment_amount: "1200000",
        installments: [{ sequence: 1, amount: "1200000", cycle_count: 3 }],
      },
      payment_summary: {
        total_amount: "1200000",
        paid_amount: "0",
        remaining_amount: "1200000",
        confirmed_installments: 0,
        installment_count: 1,
        paid_cycles: 0,
        total_cycles: 3,
      },
      payments: [],
    };
    vi.mocked(apiEnvelope).mockResolvedValueOnce({
      data: [fullRequest],
      meta: { page: 1, page_size: 30, total: 1 },
    });
    const list = renderWithProviders(<CSAPurchaseRequestList />);
    expect(await screen.findByText("Trả thẳng")).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "Phương thức thanh toán" })).toBeNull();
    list.unmount();
    mockDetailApi(fullRequest);
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);
    expect(await screen.findByText("Chưa có lịch thanh toán.")).toBeVisible();
    expect(screen.getByText("Trả thẳng")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Xác nhận thanh toán" })).toBeNull();
  });

  it("renders an ordered responsive installment schedule with backend totals and states", async () => {
    mockDetailApi(installmentRequest);
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);
    expect(await screen.findByText("Lịch thanh toán")).toBeVisible();
    expect(screen.getByText("Trả góp 3 lần")).toBeVisible();
    expect(screen.getByText(/800\.000/)).toBeVisible();
    expect(screen.getAllByText("1/3")).toHaveLength(2);
    const schedule = screen.getByRole("table", { name: "Lịch thanh toán" });
    const rows = within(schedule).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => within(row).getByRole("rowheader").textContent)).toEqual([
      "Lần thanh toán 1",
      "Lần thanh toán 2",
      "Lần thanh toán 3",
    ]);
    expect(rows[0]).toHaveTextContent("Đã xác nhận");
    expect(rows[0]).toHaveTextContent("Admin A");
    expect(rows[0]).toHaveTextContent("Đã đối soát");
    expect(rows[1]).toHaveTextContent("Đã báo thanh toán");
    expect(rows[2]).toHaveTextContent("Quá hạn");
    expect(rows[1].querySelector("td[data-label='Hạn thanh toán']")).toHaveTextContent(
      "02/11/2026 01:00",
    );
    expect(within(rows[0] as HTMLElement).queryByRole("button")).toBeNull();
    expect(within(rows[1] as HTMLElement).getAllByRole("button")).toHaveLength(2);
    expect(within(rows[2] as HTMLElement).queryByRole("button")).toBeNull();
    expect(screen.getByRole("region", { name: "Lịch thanh toán" })).toContainElement(schedule);
  });

  it("confirms only a reported approved payment, prevents duplicate submit and reloads detail", async () => {
    const confirmed: CSAPurchaseRequest = {
      ...installmentRequest,
      payments: installmentRequest.payments?.map((entry) =>
        entry.installment_sequence === 2
          ? { ...entry, status: "confirmed" as const, amount_paid: "400000" }
          : entry,
      ),
    };
    let loaded = installmentRequest;
    let resolveMutation!: (value: CSAPurchaseRequest) => void;
    const mutation = new Promise<CSAPurchaseRequest>((resolve) => {
      resolveMutation = resolve;
    });
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-purchase-requests/${request.id}` && !init?.method)
        return loaded as never;
      if (path === `admin/csa-purchase-requests/${request.id}/payments/2/confirm`)
        return mutation as never;
      if (
        path === "administrative-units/provinces" ||
        path.startsWith("administrative-units/wards")
      )
        return [] as never;
      throw new Error(`unexpected:${path}`);
    });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);
    const confirm = await screen.findByRole("button", { name: "Xác nhận thanh toán" });
    fireEvent.click(confirm);
    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Xác nhận thanh toán" });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Số tiền thực nhận"), {
      target: { value: "399999" },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Số tiền thực nhận"), {
      target: { value: "400000" },
    });
    expect(submit).toBeEnabled();
    fireEvent.change(within(dialog).getByLabelText("Ghi chú"), { target: { value: "Đối soát" } });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(
      vi.mocked(api).mock.calls.filter(([path]) => String(path).endsWith("/payments/2/confirm")),
    ).toHaveLength(1);
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      `admin/csa-purchase-requests/${request.id}/payments/2/confirm`,
      { method: "POST", body: JSON.stringify({ amount_paid: "400000", note: "Đối soát" }) },
    );
    expect(submit).toBeDisabled();
    loaded = confirmed;
    await act(async () => resolveMutation(confirmed));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Xác nhận thanh toán" })).toBeNull();
    expect(
      vi
        .mocked(api)
        .mock.calls.filter(
          ([path, init]) => path === `admin/csa-purchase-requests/${request.id}` && !init?.method,
        ).length,
    ).toBeGreaterThan(1);
  });

  it("requires a rejection reason and refreshes on a payment race conflict", async () => {
    let loaded = installmentRequest;
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-purchase-requests/${request.id}` && !init?.method)
        return loaded as never;
      if (path.endsWith("/payments/2/reject")) {
        loaded = {
          ...installmentRequest,
          payments: installmentRequest.payments?.map((entry) =>
            entry.installment_sequence === 2 ? { ...entry, status: "confirmed" as const } : entry,
          ),
        };
        throw new Error("csa_payment_state_conflict");
      }
      if (
        path === "administrative-units/provinces" ||
        path.startsWith("administrative-units/wards")
      )
        return [] as never;
      throw new Error(`unexpected:${path}`);
    });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);
    fireEvent.click(await screen.findByRole("button", { name: "Từ chối khoản thanh toán" }));
    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Từ chối khoản thanh toán" });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Lý do từ chối"), {
      target: { value: "Sai giao dịch" },
    });
    fireEvent.click(submit);
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      `admin/csa-purchase-requests/${request.id}/payments/2/reject`,
      { method: "POST", body: JSON.stringify({ rejection_reason: "Sai giao dịch" }) },
    );
    expect(await screen.findByText(/Khoản thanh toán đã thay đổi/)).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Từ chối khoản thanh toán" })).toBeNull();
  });

  it("rejects a reported installment with only the required reason and reloads its history", async () => {
    const rejected: CSAPurchaseRequest = {
      ...installmentRequest,
      payments: installmentRequest.payments?.map((entry) =>
        entry.installment_sequence === 2
          ? {
              ...entry,
              status: "rejected" as const,
              rejection_reason: "Sai mã",
              rejected_at: "2026-11-03T01:00:00Z",
            }
          : entry,
      ),
    };
    let loaded = installmentRequest;
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-purchase-requests/${request.id}` && !init?.method)
        return loaded as never;
      if (path.endsWith("/payments/2/reject")) {
        loaded = rejected;
        return rejected as never;
      }
      if (
        path === "administrative-units/provinces" ||
        path.startsWith("administrative-units/wards")
      )
        return [] as never;
      throw new Error(`unexpected:${path}`);
    });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);
    fireEvent.click(await screen.findByRole("button", { name: "Từ chối khoản thanh toán" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Từ chối khoản thanh toán" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Lý do từ chối"), {
      target: { value: "Sai mã" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Từ chối khoản thanh toán" }));
    expect(await screen.findByText(/Lý do từ chối: Sai mã/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Từ chối khoản thanh toán" })).toBeNull();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      `admin/csa-purchase-requests/${request.id}/payments/2/reject`,
      { method: "POST", body: JSON.stringify({ rejection_reason: "Sai mã" }) },
    );
  });

  it("keeps a reported payment visible and localizes backend amount errors", async () => {
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-purchase-requests/${request.id}` && !init?.method)
        return installmentRequest as never;
      if (path.endsWith("/payments/2/confirm")) throw new Error("csa_payment_amount_mismatch");
      if (
        path === "administrative-units/provinces" ||
        path.startsWith("administrative-units/wards")
      )
        return [] as never;
      throw new Error(`unexpected:${path}`);
    });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);
    fireEvent.click(await screen.findByRole("button", { name: "Xác nhận thanh toán" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Số tiền thực nhận"), {
      target: { value: "400000" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận thanh toán" }));
    expect(
      await within(dialog).findByText("Số tiền thực nhận phải bằng số tiền phải trả."),
    ).toBeVisible();
    expect(within(dialog).getByLabelText("Số tiền thực nhận")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("Đã báo thanh toán")).toBeVisible();
    expect(screen.queryByText("csa_payment_amount_mismatch")).toBeNull();
  });

  it("never exposes installment actions before approval even if payment is reported", async () => {
    mockDetailApi({ ...installmentRequest, status: "payment_confirmed" });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);
    expect(await screen.findByText("Lịch thanh toán")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Xác nhận thanh toán" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Từ chối khoản thanh toán" })).toBeNull();
  });

  it("uses English installment copy without leaking sensitive API fields", async () => {
    mockDetailApi({
      ...installmentRequest,
      guest_confirmation_token: "secret" as never,
      storage_key: "private/contract.pdf" as never,
    } as CSAPurchaseRequest);
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />, "en");
    expect(await screen.findByText("Payment schedule")).toBeVisible();
    expect(screen.getByText("Installments (3)")).toBeVisible();
    expect(screen.getByText("Payment reported")).toBeVisible();
    expect(screen.queryByText("secret")).toBeNull();
    expect(screen.queryByText("private/contract.pdf")).toBeNull();
  });

  it("renders loading, empty and permission error states", async () => {
    vi.mocked(apiEnvelope).mockResolvedValueOnce({
      data: [],
      meta: { page: 1, page_size: 30, total: 0 },
    });
    const first = renderWithProviders(<CSAPurchaseRequestList />);
    expect(screen.getByText("Đang tải yêu cầu mua CSA…")).toBeInTheDocument();
    expect(await screen.findByText("Không tìm thấy yêu cầu mua CSA.")).toBeInTheDocument();
    first.unmount();

    vi.mocked(apiEnvelope).mockRejectedValueOnce(new Error("forbidden"));
    renderWithProviders(<CSAPurchaseRequestList />);
    expect(
      await screen.findByText("Tài khoản không có quyền thực hiện thao tác này."),
    ).toBeInTheDocument();
  });

  it("renders a native detail link and opens it from the row", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [request],
      meta: { page: 1, page_size: 30, total: 31 } satisfies PaginationMeta,
    });
    renderWithProviders(<CSAPurchaseRequestList />);

    const link = await screen.findByRole("link", {
      name: `${request.request_code}: ${request.name}`,
    });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", `/csa-purchase-requests/${request.id}`);
    expect(screen.getByText("0901234567")).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "Số tiền" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Thao tác" })).not.toBeInTheDocument();
    expect(screen.queryByText("1.200.000 ₫")).not.toBeInTheDocument();

    const row = link.closest("tr")!;
    fireEvent.click(row);
    expect(navigation.push.mock.lastCall?.[0]).toBe(`/csa-purchase-requests/${request.id}`);
  });

  it("hides purchase requests from the previous filter until matching results arrive", async () => {
    const meta = { page: 1, page_size: 30, total: 1 };
    let finish!: (result: { data: CSAPurchaseRequest[]; meta: PaginationMeta }) => void;
    const filtered = new Promise<{ data: CSAPurchaseRequest[]; meta: PaginationMeta }>(
      (resolve) => {
        finish = resolve;
      },
    );
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({ data: [request], meta })
      .mockReturnValueOnce(filtered);
    renderWithProviders(<CSAPurchaseRequestList />, "en");

    const name = `${request.request_code}: ${request.name}`;
    await screen.findByRole("link", { name });
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    const filters = within(screen.getByRole("dialog"));
    selectOption(filters.getByRole("textbox", { name: "Status" }), "approved");
    fireEvent.click(filters.getByRole("button", { name: "Apply" }));

    expect(window.location.search).toBe("?status=approved");
    expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading CSA purchase requests");
    finish({ data: [{ ...request, name: "Approved buyer", status: "approved" }], meta });
    expect(
      await screen.findByRole("link", { name: `${request.request_code}: Approved buyer` }),
    ).toBeVisible();
  });

  it("refreshes the request list without losing the URL filters", async () => {
    window.history.replaceState(null, "", "/csa-purchase-requests?search=ABC&status=approved");
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [request],
      meta: { page: 1, page_size: 30, total: 1 },
    });
    renderWithProviders(<CSAPurchaseRequestList />, "en");

    const link = await screen.findByRole("link", {
      name: `${request.request_code}: ${request.name}`,
    });
    expect(link).toHaveAttribute(
      "href",
      `/csa-purchase-requests/${request.id}?search=ABC&status=approved`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh CSA purchase requests" }));
    await waitFor(() => expect(apiEnvelope).toHaveBeenCalledTimes(2));
    expect(vi.mocked(apiEnvelope).mock.lastCall?.[0]).toContain("search=ABC&status=approved");
  });

  it("renders the request code once and spaces the available detail actions", async () => {
    mockDetailApi();
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);

    await screen.findByText(request.request_code);
    expect(screen.getAllByText(request.request_code)).toHaveLength(1);
    const approve = screen.getByRole("button", { name: "Duyệt" });
    const reject = screen.getByRole("button", { name: "Từ chối" });
    const actions = screen.getByRole("group", { name: "Thao tác" });
    expect(actions).toContainElement(approve);
    expect(actions).toContainElement(reject);
    expect(screen.getByText("10/09/2026 08:00")).toBeInTheDocument();
    expect(screen.queryByText(request.created_at)).not.toBeInTheDocument();
  });

  it("validates dd/mm/yyyy approval dates and submits an ISO date", async () => {
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-purchase-requests/${request.id}` && !init?.method)
        return request as never;
      if (path.endsWith("/approve")) return { ...request, status: "approved" } as never;
      if (
        path === "administrative-units/provinces" ||
        path.startsWith("administrative-units/wards")
      )
        return [] as never;
      throw new Error(`unexpected:${path}`);
    });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Duyệt" }));
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText("Ngày bắt đầu");
    const confirm = within(dialog).getByRole("button", { name: "Xác nhận duyệt" });
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("placeholder", "dd/mm/yyyy");
    const pickerButton = within(dialog).getByRole("button", {
      name: "Mở lịch chọn ngày bắt đầu",
    });
    expect(pickerButton).toBeEnabled();
    fireEvent.change(input, { target: { value: "29112099" } });
    fireEvent.click(pickerButton);
    fireEvent.click(screen.getByRole("button", { name: "30 November 2099" }));
    expect(input).toHaveValue("30/11/2099");

    fireEvent.change(input, { target: { value: "31022099" } });
    expect(input).toHaveValue("31/02/2099");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(
      within(dialog).getByText("Ngày bắt đầu phải đúng định dạng dd/mm/yyyy và là ngày hợp lệ."),
    ).toHaveClass("field-error");
    expect(confirm).toBeDisabled();

    fireEvent.change(input, { target: { value: "01012020" } });
    expect(within(dialog).getByText(/ngày hợp lệ tiếp theo/i)).toHaveClass("field-error");
    expect(confirm).toBeDisabled();

    fireEvent.change(input, { target: { value: "01122099" } });
    expect(input).toHaveValue("01/12/2099");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        `admin/csa-purchase-requests/${request.id}/approve`,
        expect.objectContaining({ body: JSON.stringify({ start_date: "2099-12-01" }) }),
      ),
    );
  });

  it("applies search, status and pagination", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [request],
      meta: { page: 1, page_size: 30, total: 31 } satisfies PaginationMeta,
    });
    renderWithProviders(<CSAPurchaseRequestList />);
    await screen.findByText(request.request_code);

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Tìm theo mã yêu cầu, tên hoặc số điện thoại" }),
      {
        target: { value: "ABC" },
      },
    );
    fireEvent.submit(screen.getByRole("button", { name: "Tìm kiếm" }).closest("form")!);
    await waitFor(() =>
      expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).toContain("search=ABC"),
    );
    const filter = screen.getByRole("button", { name: "Bộ lọc" });
    await waitFor(() => expect(filter).toBeEnabled());
    fireEvent.click(filter);
    selectOption(
      within(screen.getByRole("dialog")).getByRole("textbox", { name: "Trạng thái" }),
      "approved",
    );
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    await waitFor(() =>
      expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).toContain("status=approved"),
    );
    const next = screen.getByRole("button", { name: "Sau" });
    await waitFor(() => expect(next).toBeEnabled());
    fireEvent.click(next);
    await waitFor(() => expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).toContain("page=2"));
  });

  it("renders and filters expired requests without changing row navigation", async () => {
    const expiredRequest: CSAPurchaseRequest = {
      ...request,
      status: "expired",
      expired_at: "2026-09-18T03:00:00Z",
      expired_reason: "request_expiry_elapsed",
    };
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [expiredRequest],
      meta: { page: 1, page_size: 30, total: 1 },
    });
    renderWithProviders(<CSAPurchaseRequestList />);

    const row = await screen.findByRole("link", {
      name: `${expiredRequest.request_code}: ${expiredRequest.name}`,
    });
    expect(within(row.closest("tr")!).getByText("Đã hết hạn")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
    selectOption(
      within(screen.getByRole("dialog")).getByRole("textbox", { name: "Trạng thái" }),
      "expired",
    );
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    await waitFor(() =>
      expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).toContain("status=expired"),
    );
    expect(
      await screen.findByRole("link", {
        name: `${expiredRequest.request_code}: ${expiredRequest.name}`,
      }),
    ).toHaveAttribute("href", `/csa-purchase-requests/${expiredRequest.id}?status=expired`);
  });

  it("renders immutable detail sections and hides actions for terminal requests", async () => {
    mockDetailApi({
      ...request,
      status: "approved",
      customer_id: "customer-id",
      membership_id: "membership-id",
    });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);

    expect(await screen.findByRole("heading", { name: "Thông tin người mua" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Thông tin gói tại thời điểm mua" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thông tin chuyển khoản" })).toBeInTheDocument();
    expect(await screen.findByText("Đồng Tháp")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duyệt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Từ chối" })).not.toBeInTheDocument();
    expect(screen.queryByText(/guest_confirmation_token/i)).not.toBeInTheDocument();
  });

  it.each([
    ["pending", "pending"],
    ["payment_confirmed", "pending"],
    ["approved", "pending"],
    ["expired", "pending"],
    ["rejected", "completed"],
    ["rejected", "not_applicable"],
  ] as const)("hides the refund action for %s / %s", async (status, refundStatus) => {
    mockDetailApi({ ...request, status, refund_status: refundStatus });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);
    await screen.findByText(request.request_code);
    expect(screen.queryByRole("button", { name: "Đánh dấu đã hoàn tiền" })).not.toBeInTheDocument();
  });

  it("marks a rejected pending refund once, reloads detail and hides the completed action", async () => {
    const awaitingRefund: CSAPurchaseRequest = {
      ...request,
      status: "rejected",
      refund_status: "pending",
    };
    const completed: CSAPurchaseRequest = {
      ...awaitingRefund,
      refund_status: "completed",
      refund_marked_at: "2026-09-12T03:00:00Z",
      refund_marked_by: { id: "admin-id", name: "Quản trị viên" },
      refund_note: "Đã chuyển lại tiền",
    };
    let resolveMutation!: (value: CSAPurchaseRequest) => void;
    const mutation = new Promise<CSAPurchaseRequest>((resolve) => {
      resolveMutation = resolve;
    });
    let detailLoads = 0;
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-purchase-requests/${request.id}` && !init?.method) {
        detailLoads += 1;
        return (detailLoads === 1 ? awaitingRefund : completed) as never;
      }
      if (path === `admin/csa-purchase-requests/${request.id}/mark-refunded`)
        return mutation as never;
      if (
        path === "administrative-units/provinces" ||
        path.startsWith("administrative-units/wards")
      )
        return [] as never;
      throw new Error(`unexpected:${path}`);
    });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);
    fireEvent.click(await screen.findByRole("button", { name: "Đánh dấu đã hoàn tiền" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Xác nhận đánh dấu đã hoàn tiền" }),
    ).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText("Ghi chú hoàn tiền"), {
      target: { value: " Đã chuyển lại tiền " },
    });
    const confirm = within(dialog).getByRole("button", { name: "Xác nhận đánh dấu đã hoàn tiền" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        `admin/csa-purchase-requests/${request.id}/mark-refunded`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ refund_note: "Đã chuyển lại tiền" }),
        }),
      ),
    );
    expect(
      vi.mocked(api).mock.calls.filter(([path]) => path.endsWith("/mark-refunded")),
    ).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: "Đang đánh dấu hoàn tiền…" })).toBeDisabled();
    expect(within(dialog).getByLabelText("Ghi chú hoàn tiền")).toBeDisabled();

    await act(async () => resolveMutation(completed));
    await waitFor(() => expect(detailLoads).toBe(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Đã hoàn tiền")).toBeVisible();
    expect(screen.getByText("Đã chuyển lại tiền")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Đánh dấu đã hoàn tiền" })).not.toBeInTheDocument();
    expect(
      vi.mocked(api).mock.calls.filter(([path]) => path.endsWith("/mark-refunded")),
    ).toHaveLength(1);
  });

  it("shows a localized refund error without exposing backend details", async () => {
    const awaitingRefund: CSAPurchaseRequest = {
      ...request,
      status: "rejected",
      refund_status: "pending",
    };
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-purchase-requests/${request.id}` && !init?.method)
        return awaitingRefund as never;
      if (path.endsWith("/mark-refunded")) throw new Error("internal_refund_secret");
      if (
        path === "administrative-units/provinces" ||
        path.startsWith("administrative-units/wards")
      )
        return [] as never;
      throw new Error(`unexpected:${path}`);
    });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);
    fireEvent.click(await screen.findByRole("button", { name: "Đánh dấu đã hoàn tiền" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Xác nhận đánh dấu đã hoàn tiền",
      }),
    );
    expect(
      await within(screen.getByRole("dialog")).findByText(
        "Không thể đánh dấu đã hoàn tiền. Vui lòng thử lại.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("internal_refund_secret")).not.toBeInTheDocument();
  });

  it("renders expiry metadata and exposes no workflow mutation for an expired request", async () => {
    const expiredRequest: CSAPurchaseRequest = {
      ...request,
      status: "expired",
      expires_at: "2026-09-17T01:00:00Z",
      expired_at: "2026-09-18T03:00:00Z",
      expired_reason: "request_expiry_elapsed",
      payment_confirmed_at: null,
    };
    mockDetailApi(expiredRequest);
    renderWithProviders(<CSAPurchaseRequestDetail requestId={expiredRequest.id} />);

    expect(await screen.findByText("Đã hết hạn")).toBeVisible();
    expect(screen.getByText(expiredRequest.request_code)).toBeVisible();
    expect(screen.getByText("17/09/2026 08:00")).toBeVisible();
    expect(screen.getByText("18/09/2026 10:00")).toBeVisible();
    expect(screen.getByText("Đã quá thời hạn xử lý yêu cầu.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Duyệt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Từ chối" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ngày bắt đầu")).not.toBeInTheDocument();
    expect(screen.queryByText(/xử lý khác biệt thông tin khách hàng/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hoàn tiền/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /PDF/i })).not.toBeInTheDocument();
    expect(
      vi
        .mocked(api)
        .mock.calls.some(([, init]) => init?.method === "POST" || init?.method === "PATCH"),
    ).toBe(false);
  });

  it("localizes an expiry race and reloads the terminal request", async () => {
    const expiredRequest: CSAPurchaseRequest = {
      ...request,
      status: "expired",
      expired_at: "2026-09-18T03:00:00Z",
      expired_reason: "request_expiry_elapsed",
    };
    let detailLoads = 0;
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-purchase-requests/${request.id}` && !init?.method) {
        detailLoads += 1;
        return (detailLoads === 1 ? request : expiredRequest) as never;
      }
      if (path.endsWith("/approve")) {
        throw Object.assign(new Error("csa_purchase_request_expired"), { status: 409 });
      }
      if (
        path === "administrative-units/provinces" ||
        path.startsWith("administrative-units/wards")
      )
        return [] as never;
      throw new Error(`unexpected:${path}`);
    });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Duyệt" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận duyệt" }));

    expect(
      await screen.findByText("Yêu cầu đã hết hạn. Dữ liệu mới nhất đã được tải lại."),
    ).toBeVisible();
    expect(await screen.findByText("Đã hết hạn")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(detailLoads).toBe(2);
    expect(vi.mocked(api).mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("requires a rejection reason and submits it once", async () => {
    mockDetailApi();
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-purchase-requests/${request.id}` && !init?.method)
        return request as never;
      if (path.endsWith("/reject")) return { ...request, status: "rejected" } as never;
      if (
        path === "administrative-units/provinces" ||
        path.startsWith("administrative-units/wards")
      )
        return [] as never;
      throw new Error(`unexpected:${path}`);
    });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);
    fireEvent.click(await screen.findByRole("button", { name: "Từ chối" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Xác nhận từ chối" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Lý do từ chối"), {
      target: { value: "Sai giao dịch" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận từ chối" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        `admin/csa-purchase-requests/${request.id}/reject`,
        expect.objectContaining({ body: JSON.stringify({ rejection_reason: "Sai giao dịch" }) }),
      ),
    );
  });

  it("shows start-date errors and requires explicit customer conflict resolution", async () => {
    const conflict = Object.assign(new Error("csa_purchase_customer_resolution_required"), {
      payload: {
        errors: [
          {
            code: "csa_purchase_customer_resolution_required",
            context: {
              customer: {
                id: "customer-id",
                name: "Tên cũ",
                phone: request.phone,
                province_code: "66",
                ward_code: "22015",
                address: "Địa chỉ cũ",
                memberships: [
                  {
                    id: "membership-id",
                    package_name: "Gói cũ",
                    status: "active",
                    start_date: "2026-01-01",
                    end_date: "2026-04-01",
                  },
                ],
              },
              request: {
                name: request.name,
                phone: request.phone,
                province_code: "66",
                ward_code: "22015",
                address: request.address,
              },
            },
          },
        ],
      },
      status: 409,
    });
    let approveCalls = 0;
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-purchase-requests/${request.id}` && !init?.method)
        return request as never;
      if (path.endsWith("/approve")) {
        approveCalls += 1;
        if (approveCalls === 1) throw new Error("membership_overlap");
        if (approveCalls === 2) throw conflict;
        return { ...request, status: "approved" } as never;
      }
      if (
        path === "administrative-units/provinces" ||
        path.startsWith("administrative-units/wards")
      )
        return [] as never;
      throw new Error(`unexpected:${path}`);
    });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);
    fireEvent.click(await screen.findByRole("button", { name: "Duyệt" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận duyệt" }));
    expect(
      await screen.findByText("Ngày bắt đầu bị trùng với gói CSA hiện có."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận duyệt" }));
    expect(
      await screen.findByRole("heading", { name: "Xử lý khác biệt thông tin khách hàng" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Gói cũ/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xác nhận duyệt" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Giữ thông tin Customer cũ"));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận duyệt" }));
    await waitFor(() =>
      expect(api).toHaveBeenLastCalledWith(
        `admin/csa-purchase-requests/${request.id}/approve`,
        expect.objectContaining({
          body: expect.stringContaining('"customer_resolution":"keep_existing"'),
        }),
      ),
    );
  });

  it("treats reject-conflict as a reason-required rejection", async () => {
    const conflict = Object.assign(new Error("csa_purchase_customer_resolution_required"), {
      payload: {
        errors: [
          {
            code: "csa_purchase_customer_resolution_required",
            context: {
              customer: {
                id: "customer-id",
                name: "Tên cũ",
                phone: request.phone,
                province_code: "66",
                ward_code: "22015",
                address: "Địa chỉ cũ",
                memberships: [],
              },
              request: {
                name: request.name,
                phone: request.phone,
                province_code: "66",
                ward_code: "22015",
                address: request.address,
              },
            },
          },
        ],
      },
      status: 409,
    });
    let approveCalls = 0;
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-purchase-requests/${request.id}` && !init?.method)
        return request as never;
      if (path.endsWith("/approve")) {
        approveCalls += 1;
        if (approveCalls === 1) throw conflict;
        return {
          ...request,
          status: "rejected",
          rejected_at: "2026-09-10T03:00:00Z",
          rejection_reason: "Thông tin không khớp",
        } as never;
      }
      if (
        path === "administrative-units/provinces" ||
        path.startsWith("administrative-units/wards")
      )
        return [] as never;
      throw new Error(`unexpected:${path}`);
    });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Duyệt" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận duyệt" }));
    await screen.findByRole("heading", { name: "Xử lý khác biệt thông tin khách hàng" });
    fireEvent.click(screen.getByLabelText("Từ chối do xung đột"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Từ chối yêu cầu mua CSA" })).toBeVisible();
    const confirm = within(dialog).getByRole("button", { name: "Xác nhận từ chối" });
    expect(confirm).toHaveStyle({ "--button-bg": "var(--mantine-color-red-filled)" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Lý do từ chối"), {
      target: { value: "Thông tin không khớp" },
    });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(api).toHaveBeenLastCalledWith(
        `admin/csa-purchase-requests/${request.id}/approve`,
        expect.objectContaining({
          body: expect.stringMatching(
            /"customer_resolution":"reject_conflict".*"rejection_reason":"Thông tin không khớp"/,
          ),
        }),
      ),
    );
    expect(screen.getByText("Đã từ chối yêu cầu mua CSA.")).toBeInTheDocument();
    expect(screen.queryByText("Đã duyệt yêu cầu mua CSA.")).not.toBeInTheDocument();
    expect(screen.getByText("Đã từ chối")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duyệt" })).not.toBeInTheDocument();
  });

  it("maps approval customer errors to actionable localized copy", async () => {
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-purchase-requests/${request.id}` && !init?.method)
        return request as never;
      if (path.endsWith("/approve")) throw new Error("csa_purchase_customer_incomplete");
      if (
        path === "administrative-units/provinces" ||
        path.startsWith("administrative-units/wards")
      )
        return [] as never;
      throw new Error(`unexpected:${path}`);
    });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Duyệt" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận duyệt" }));

    expect(
      await screen.findByText(
        "Khách hàng chưa đủ thông tin bắt buộc. Hãy cập nhật hồ sơ khách hàng trước khi gán gói.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("csa_purchase_customer_incomplete")).not.toBeInTheDocument();
  });

  it("explains how to recover when the account shipping address is unavailable", async () => {
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-purchase-requests/${request.id}` && !init?.method)
        return request as never;
      if (path.endsWith("/approve"))
        throw new Error("csa_purchase_customer_shipping_address_unavailable");
      if (
        path === "administrative-units/provinces" ||
        path.startsWith("administrative-units/wards")
      )
        return [] as never;
      throw new Error(`unexpected:${path}`);
    });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Duyệt" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận duyệt" }));

    expect(
      await screen.findByText(
        "Địa chỉ giao hàng của tài khoản không còn được hỗ trợ. Hãy yêu cầu khách hàng cập nhật địa chỉ trong Account rồi thử duyệt lại.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("csa_purchase_customer_shipping_address_unavailable"),
    ).not.toBeInTheDocument();
  });

  it.each([
    [
      "csa_contract_pdf_snapshot_incomplete",
      "Dữ liệu hợp đồng hoặc lịch thanh toán chưa nhất quán. Yêu cầu chưa được duyệt.",
    ],
    [
      "csa_contract_pdf_storage_error",
      "Không thể tạo hoặc lưu PDF hợp đồng Việt/Anh. Yêu cầu chưa được duyệt, vui lòng thử lại.",
    ],
    [
      "csa_contract_pdf_error",
      "Không thể tạo hoặc lưu PDF hợp đồng Việt/Anh. Yêu cầu chưa được duyệt, vui lòng thử lại.",
    ],
  ])("maps %s to actionable localized contract copy", async (code, message) => {
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-purchase-requests/${request.id}` && !init?.method)
        return request as never;
      if (path.endsWith("/approve")) throw new Error(code);
      if (
        path === "administrative-units/provinces" ||
        path.startsWith("administrative-units/wards")
      )
        return [] as never;
      throw new Error(`unexpected:${path}`);
    });
    renderWithProviders(<CSAPurchaseRequestDetail requestId={request.id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Duyệt" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận duyệt" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText(code)).not.toBeInTheDocument();
  });
});

describe("CSA bank settings", () => {
  const settings: MembershipPaymentSettings = {
    key: "default",
    direct_transfer_enabled: false,
    bank_bin: "",
    bank_name: "",
    account_number: "",
    account_name: "",
    version: 0,
    updated_at: null,
  };

  it("loads the bank directory, validates inline and saves without local storage", async () => {
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === "admin/membership-payment-settings" && !init?.method) return settings as never;
      if (path === "admin/membership-banks")
        return [{ bin: "970436", name: "Vietcombank", short_name: "VCB", code: "VCB" }] as never;
      if (path === "admin/membership-payment-settings" && init?.method === "PATCH")
        return {
          ...settings,
          bank_bin: "970436",
          bank_name: "Vietcombank",
          account_number: "123456789",
          account_name: "NFV",
          version: 1,
        } as never;
      throw new Error(`unexpected:${path}`);
    });
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");
    renderWithProviders(<MembershipPaymentSettingsForm />);

    const save = await screen.findByRole("button", { name: "Lưu cấu hình" });
    fireEvent.click(save);
    expect(await screen.findByText("Hãy chọn ngân hàng.")).toBeInTheDocument();
    expect(screen.getByText("Số tài khoản phải gồm 6–19 chữ số.")).toBeInTheDocument();
    const bank = screen.getByRole("combobox", { name: /Ngân hàng/ });
    expect(bank).toHaveAccessibleDescription("Hãy chọn ngân hàng.");
    selectOption(bank, "970436");
    fireEvent.change(screen.getByLabelText(/Số tài khoản/), {
      target: { value: "123456789" },
    });
    fireEvent.change(screen.getByLabelText(/Tên chủ tài khoản/), {
      target: { value: "NFV" },
    });
    fireEvent.click(save);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "admin/membership-payment-settings",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"bank_bin":"970436"'),
        }),
      ),
    );
    expect(localStorageSpy).not.toHaveBeenCalled();
    localStorageSpy.mockRestore();
  });

  it("maps a bank directory backend error without exposing internals", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "admin/membership-payment-settings") return settings as never;
      throw new Error("membership_bank_directory_unavailable");
    });
    renderWithProviders(<MembershipPaymentSettingsForm />);

    expect(
      await screen.findByText("Không tải được danh sách ngân hàng. Vui lòng thử lại."),
    ).toBeInTheDocument();
    expect(screen.queryByText("membership_bank_directory_unavailable")).not.toBeInTheDocument();
  });

  it("maps backend bank validation back to inline fields", async () => {
    const invalidSettings = Object.assign(new Error("invalid_membership_payment_settings"), {
      status: 400,
      payload: {
        errors: [
          {
            code: "invalid_membership_payment_settings",
            fields: { bank_name: ["Bank name does not match the selected BIN."] },
          },
        ],
      },
    });
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === "admin/membership-payment-settings" && !init?.method)
        return { ...settings, bank_bin: "970436", bank_name: "Vietcombank" } as never;
      if (path === "admin/membership-banks")
        return [{ bin: "970436", name: "Vietcombank", short_name: "VCB", code: "VCB" }] as never;
      if (path === "admin/membership-payment-settings" && init?.method === "PATCH")
        throw invalidSettings;
      throw new Error(`unexpected:${path}`);
    });
    renderWithProviders(<MembershipPaymentSettingsForm />);

    fireEvent.change(await screen.findByLabelText(/Số tài khoản/), {
      target: { value: "123456789" },
    });
    fireEvent.change(screen.getByLabelText(/Tên chủ tài khoản/), {
      target: { value: "NFV" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu cấu hình" }));

    expect(
      await screen.findByText("Ngân hàng không hợp lệ hoặc không còn được VietQR hỗ trợ."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Bank name does not match/)).not.toBeInTheDocument();
  });
});
