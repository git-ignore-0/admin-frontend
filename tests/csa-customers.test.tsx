import { selectOption } from "./select-option";
import { focusManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateCustomerPage from "@/app/(admin)/csa-customers/new/page";
import AssignMembershipPage from "@/app/(admin)/memberships/assign/page";
import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { AdminHeaderContent } from "@/components/admin-header";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { CSACustomerDetail } from "@/components/csa-customer-detail";
import { CSACustomerForm } from "@/components/csa-customer-form";
import { CSACustomerList } from "@/components/csa-customer-list";
import { MembershipAssignmentForm } from "@/components/membership-assignment-form";
import { ToastProvider } from "@/components/toast-provider";
import { adminDictionaries } from "@/lib/admin-i18n";
import { adminNavigation, resolveAdminBreadcrumbs } from "@/lib/admin-navigation";
import { api, apiEnvelope } from "@/lib/client-api";
import type { AdminMembership, CSACustomer, MembershipStatus, PaginationMeta } from "@/lib/types";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), back: vi.fn() }));
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("@/lib/admin-locale", () => ({ getAdminLocale: async () => "en" }));
vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  const subscribe = (notify: () => void) => {
    window.addEventListener("popstate", notify);
    return () => window.removeEventListener("popstate", notify);
  };
  return {
    useRouter: () => ({ ...navigation, refresh: vi.fn() }),
    usePathname: () => useSyncExternalStore(subscribe, () => window.location.pathname),
    useSearchParams: () => {
      const search = useSyncExternalStore(subscribe, () => window.location.search);
      return useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});
beforeEach(() => {
  window.history.replaceState(null, "", "/csa-customers");
  const replaceState = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, "replaceState").mockImplementation((data, unused, url) => {
    replaceState(data, unused, url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
});
afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
const meta: PaginationMeta = { page: 1, page_size: 30, total: 1 };
const customer: CSACustomer = {
  id: "24803641-2dce-4cac-8fc4-91e55f03e95f",
  name: "Lan Nguyen",
  phone: "0912345678",
  province_code: "79",
  ward_code: "001",
  address: "District 1",
  user: null,
  current_membership: null,
  next_scheduled_membership: null,
  status: "new",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  memberships: [],
};
const supportedShippingAreas = [
  {
    province_code: "79",
    province_name: "Ho Chi Minh City",
    wards: [{ ward_code: "001", ward_name: "Ben Nghe Ward", shipping_fee_vnd: "30000" }],
  },
];

function membership(
  id: string,
  packageName: string,
  status: MembershipStatus,
  startDate: string | null,
  endDate: string,
): AdminMembership {
  return {
    id,
    customer_id: customer.id,
    user_id: null,
    package_id: `package-${id}`,
    price_option_id: `price-${id}`,
    customer,
    status,
    package_name: packageName,
    package_description: "",
    price_option: {
      duration_months: 3,
      monthly_price_vnd: "500000",
      total_price_vnd: "1500000",
    },
    duration_months: 3,
    monthly_price_vnd: "500000",
    total_price_vnd: "1500000",
    farmbrite_order_reference: `FB-${id}`,
    quota_policy: "expire",
    start_date: startDate as string,
    end_date: endDate,
    activated_at: startDate ? `${startDate}T00:00:00Z` : "",
  };
}
function providers(child: React.ReactNode, initialLocale: "en" | "vi" = "en") {
  return render(
    <AdminI18nProvider initialLocale={initialLocale}>
      <ToastProvider>
        <AdminQueryProvider>{child}</AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((finish, fail) => {
    resolve = finish;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("CSA customer administration", () => {
  it("offers only manual customer creation", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "public/shipping-areas?locale=en") return supportedShippingAreas as never;
      throw new Error(`Unexpected request: ${path}`);
    });

    providers(<CSACustomerForm />);

    expect(screen.queryByRole("radio", { name: "Choose from website accounts" })).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(await screen.findByRole("button", { name: "Create CSA customer" })).toBeVisible();
  });

  it("links the customer name to a detail URL with the current filters and page", async () => {
    window.history.replaceState(
      null,
      "",
      "/csa-customers?search=Lan&linked=managed&membership_status=active&page=2",
    );
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [customer],
      meta: { ...meta, page: 2, total: 31 },
    });
    providers(<CSACustomerList />);

    const link = await screen.findByRole("link", { name: "View details: Lan Nguyen" });
    expect(link).toHaveAttribute(
      "href",
      `/csa-customers/${customer.id}?search=Lan&linked=managed&membership_status=active&page=2`,
    );
    const row = screen.getByRole("row", { name: /Lan Nguyen/ });
    expect(within(row).getByText(customer.phone!)).toBeVisible();
    expect(within(row).getAllByRole("cell")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Create CSA customer" })).toHaveAttribute(
      "href",
      "/csa-customers/new",
    );
  });

  it("applies both filters from the popover and clears them without changing the search", async () => {
    window.history.replaceState(null, "", "/csa-customers?search=Lan");
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [customer], meta });
    providers(<CSACustomerList />);
    await screen.findByText(customer.name);

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    const filters = within(screen.getByRole("dialog"));
    selectOption(filters.getByRole("textbox", { name: "Website account" }), "linked");
    selectOption(filters.getByRole("textbox", { name: "CSA package status" }), "active");
    expect(window.location.search).toBe("?search=Lan");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith(
        expect.stringMatching(/linked=linked.*membership_status=active/),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect(window.location.search).toBe("?search=Lan&linked=linked&membership_status=active");

    const filterButton = screen.getByRole("button", { name: "Filter (2)" });
    await waitFor(() => expect(filterButton).toBeEnabled());
    fireEvent.click(filterButton);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Clear filters" }),
    );
    await waitFor(() => expect(window.location.search).toBe("?search=Lan"));
  });

  it("opens intercepted customer details in a drawer and closes via browser history", async () => {
    vi.mocked(api).mockResolvedValue(customer);
    providers(<CSACustomerDetail customerId={customer.id} intercepted />);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("heading", { name: customer.name })).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    expect(navigation.back).toHaveBeenCalledTimes(1);
  });

  it("keeps focus on the list when a refresh removes the opener after closing detail", async () => {
    const path = "/csa-customers?linked=managed";
    window.history.replaceState(null, "", path);
    const refresh = deferred<{ data: CSACustomer[]; meta: PaginationMeta }>();
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({ data: [customer], meta })
      .mockReturnValueOnce(refresh.promise);
    providers(<CSACustomerList />);
    const opener = await screen.findByRole("link", { name: "View details: Lan Nguyen" });

    act(() => {
      window.history.replaceState(null, "", `/csa-customers/${customer.id}?linked=managed`);
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(apiEnvelope).toHaveBeenCalledTimes(2));
    act(() => window.history.replaceState(null, "", path));
    await waitFor(() => expect(opener).toHaveFocus());

    refresh.resolve({ data: [], meta: { ...meta, total: 0 } });
    await screen.findByText("No matching CSA customers.");
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toContainElement(
      screen.getByRole("link", { name: "Create CSA customer" }),
    );
  });

  it("keeps the linked account and package history after an older detail refresh completes", async () => {
    const user = {
      id: "58cbea40-4749-4400-9fa3-188de573abaf",
      name: "Web User",
      email: "web@example.com",
      email_verified: true,
      login_phone_number: "0909000000",
      phone: "",
      has_csa_customer: false,
      status: "active",
      date_joined: "2026-09-01T00:00:00Z",
      points_balance: 0,
    };
    const existing = membership(
      "package-1",
      "Seasonal package",
      "active",
      "2026-10-01",
      "2027-01-01",
    );
    const staleDetail = deferred<CSACustomer>();
    const note = "Call before delivery.\nMorning only.";
    const initialDetail = { ...customer, note, memberships: [existing] };
    let detailRequests = 0;
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [user], meta });
    vi.mocked(api).mockImplementation(async (path) => {
      if (path.endsWith("/link-user")) return { ...customer, user, memberships: undefined };
      if (path === `admin/csa-customers/${customer.id}`)
        return detailRequests++ === 0 ? initialDetail : staleDetail.promise;
      return [];
    });

    providers(<CSACustomerDetail customerId={customer.id} />);
    fireEvent.click(await screen.findByRole("button", { name: "Link account" }));
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(detailRequests).toBe(2));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByRole("searchbox"), { target: { value: "web@example.com" } });
    fireEvent.click(dialog.getByRole("button", { name: "Search" }));
    fireEvent.click(await dialog.findByRole("radio"));
    fireEvent.click(dialog.getByRole("button", { name: "Confirm link" }));

    expect(await screen.findByText("Website account linked")).toBeVisible();
    await act(async () => {
      staleDetail.resolve(initialDetail);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText(user.email)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Link account" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Seasonal package" })).toBeVisible();
    const displayedNote = screen.getByText(note, { normalizer: (value) => value });
    expect(displayedNote).toBeVisible();
    expect(displayedNote).toHaveStyle({ whiteSpace: "pre-wrap" });
  });

  it.each([
    { status: 503, code: "upstream_unavailable", keepsDraft: true },
    { status: 403, code: "forbidden", keepsDraft: false },
  ])(
    "handles a background customer detail refresh failing with HTTP $status",
    async ({ status, code, keepsDraft }) => {
      const refresh = deferred<CSACustomer>();
      let detailRequests = 0;
      vi.mocked(api).mockImplementation(async (path) => {
        if (path === `admin/csa-customers/${customer.id}`)
          return detailRequests++ === 0 ? customer : refresh.promise;
        return [];
      });
      providers(<CSACustomerDetail customerId={customer.id} />);
      fireEvent.click(await screen.findByRole("button", { name: "Link account" }));
      const dialog = screen.getByRole("dialog");
      fireEvent.change(within(dialog).getByRole("searchbox"), {
        target: { value: "web@example.com" },
      });
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await waitFor(() => expect(detailRequests).toBe(2));

      refresh.reject(Object.assign(new Error(code), { status }));
      if (keepsDraft) {
        await screen.findByText("The service is currently unavailable. Try again later.");
        expect(within(dialog).getByRole("searchbox")).toHaveValue("web@example.com");
        expect(screen.getByRole("dialog")).toBe(dialog);
      } else {
        await screen.findByRole("button", { name: "Try again" });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.queryByText(customer.phone!)).toBeNull();
      }
    },
  );

  it("uses the Admin header for the customer name and back link", async () => {
    const pathname = `/csa-customers/${customer.id}`;
    const search = "search=Lan&linked=managed&page=2";
    window.history.replaceState(null, "", `${pathname}?${search}`);
    function Header() {
      return <AdminHeaderContent items={useAdminBreadcrumbs([])} />;
    }
    vi.mocked(api).mockResolvedValue(customer);
    providers(
      <AdminBreadcrumbProvider pathname={pathname} search={search}>
        <header>
          <Header />
        </header>
        <main>
          <CSACustomerDetail customerId={customer.id} />
        </main>
      </AdminBreadcrumbProvider>,
    );

    expect(screen.getByText("Loading customer details…")).toBeVisible();
    const account = await screen.findByRole("heading", { name: "Account information" });
    const history = screen.getByRole("heading", { name: "Purchased package history" });
    expect(
      account.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const header = within(screen.getByRole("banner"));
    expect(header.getByText(customer.name)).toHaveAttribute("aria-current", "page");
    expect(header.getByRole("link", { name: "CSA customers" })).toHaveAttribute(
      "href",
      `/csa-customers?${search}`,
    );
    const body = within(screen.getByRole("main"));
    expect(body.queryByRole("link", { name: "CSA customers" })).not.toBeInTheDocument();
    expect(body.getByRole("heading", { name: customer.name, level: 1 })).toHaveClass(
      "mantine-VisuallyHidden-root",
    );
    const assign = screen.getAllByRole("link", { name: "Assign CSA package" });
    expect(assign).toHaveLength(1);
    expect(assign[0]).toHaveAttribute(
      "href",
      `/memberships/assign?customerId=${customer.id}&${search}`,
    );
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Link account" })).toBeVisible();
    expect(screen.getByText("Customer without an account")).toBeVisible();
    expect(screen.getByText("This customer has not purchased a CSA package.")).toBeVisible();
    expect(screen.queryByRole("link", { name: "View details" })).toBeNull();
    const accountList = account.closest("section")?.querySelector("dl");
    expect(accountList).toBeInTheDocument();
    expect([...accountList!.querySelectorAll("dt")].map((label) => label.textContent)).toEqual([
      "Name",
      "Email",
      "Phone number",
      "Website account",
      "Province/city",
      "Ward/commune",
      "Delivery address",
    ]);
  });

  it("carries the customer list filters into the assignment link", async () => {
    window.history.replaceState(
      null,
      "",
      `/csa-customers/${customer.id}?search=Lan&linked=managed&page=2`,
    );
    vi.mocked(api).mockResolvedValue(customer);
    providers(<CSACustomerDetail customerId={customer.id} />);

    const link = await screen.findByRole("link", { name: "Assign CSA package" });
    expect(link).toHaveAttribute(
      "href",
      `/memberships/assign?customerId=${customer.id}&search=Lan&linked=managed&page=2`,
    );
  });

  it("shows localized administrative-unit names on the customer detail without exposing codes", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === `admin/csa-customers/${customer.id}`) return customer;
      if (path === "administrative-units/provinces") {
        return [{ code: "79", name: "Thành phố Hồ Chí Minh" }] as never;
      }
      if (path === "administrative-units/wards?province=79") {
        return [{ code: "001", name: "Phường Bến Nghé" }] as never;
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    providers(<CSACustomerDetail customerId={customer.id} />, "vi");

    expect(await screen.findByText("Thành phố Hồ Chí Minh")).toBeVisible();
    expect(screen.getByText("Phường Bến Nghé")).toBeVisible();
    expect(screen.queryByText("Ghi chú")).not.toBeInTheDocument();
    expect(screen.queryByText("79")).toBeNull();
    expect(screen.queryByText("001")).toBeNull();
    expect(api).toHaveBeenCalledWith(
      "administrative-units/provinces",
      expect.objectContaining({ headers: { "Accept-Language": "vi" } }),
    );
    expect(api).toHaveBeenCalledWith(
      "administrative-units/wards?province=79",
      expect.objectContaining({ headers: { "Accept-Language": "vi" } }),
    );
  });

  it("uses safe address fallbacks when administrative-unit requests fail", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === `admin/csa-customers/${customer.id}`) return customer;
      throw new Error("Administrative units unavailable");
    });

    providers(<CSACustomerDetail customerId={customer.id} />);

    await screen.findByRole("heading", { name: "Account information" });
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("administrative-units/wards?province=79", expect.anything()),
    );
    expect(screen.getByText("Province/city").nextElementSibling).toHaveTextContent("—");
    expect(screen.getByText("Ward/commune").nextElementSibling).toHaveTextContent("—");
    expect(screen.queryByText("79")).toBeNull();
    expect(screen.queryByText("001")).toBeNull();
  });

  it("renders valid membership dates newest-first, stably, before invalid dates", async () => {
    const memberships = [
      membership("invalid", "Invalid date package", "revoked", "not-a-date", "2025-08-01"),
      membership("scheduled", "Future package", "scheduled", "2026-09-01", "2026-12-01"),
      membership("same-first", "Same date first", "active", "2026-06-01", "2026-09-01"),
      membership("ended", "Older package", "ended", "2026-01-01", "2026-04-01"),
      membership("same-second", "Same date second", "active", "2026-06-01", "2026-09-01"),
      membership("missing", "Missing date package", "revoked", null, "2025-08-01"),
    ];
    const apiOrder = memberships.map((item) => item.id);
    vi.mocked(api).mockResolvedValue({
      ...customer,
      address:
        "A very long delivery address that must remain fully visible without clipping or truncation",
      user: {
        id: "user-1",
        name: "Lan Nguyen",
        email: "a.very.long.email.address.for.layout.testing@example.com",
      },
      memberships,
    });
    providers(<CSACustomerDetail customerId={customer.id} />, "vi");

    const history = await screen.findByRole("heading", { name: "Lịch sử các gói đã mua" });
    const items = within(history.closest("section")!).getAllByRole("article");
    expect(items).toHaveLength(6);
    expect(items.map((item) => within(item).getByRole("heading").textContent)).toEqual([
      "Future package",
      "Same date first",
      "Same date second",
      "Older package",
      "Invalid date package",
      "Missing date package",
    ]);
    expect(screen.getAllByText("Ngày bắt đầu")).toHaveLength(6);
    expect(screen.getAllByText("Ngày nhận sản phẩm cuối")).toHaveLength(6);
    expect(screen.getByText("Đã kết thúc")).toBeVisible();
    expect(screen.getAllByText("Đã thu hồi")).toHaveLength(2);
    expect(screen.getAllByText("Đang hoạt động")).toHaveLength(2);
    expect(screen.getByText("Sắp bắt đầu")).toBeVisible();
    expect(
      screen.getByText("a.very.long.email.address.for.layout.testing@example.com"),
    ).toBeVisible();
    expect(
      screen.getByText(
        "A very long delivery address that must remain fully visible without clipping or truncation",
      ),
    ).toBeVisible();
    const detailLinks = screen.getAllByRole("link", { name: "Xem chi tiết" });
    expect(detailLinks).toHaveLength(6);
    memberships.forEach((item) =>
      expect(
        detailLinks.some((link) => link.getAttribute("href") === `/memberships/${item.id}`),
      ).toBe(true),
    );
    expect(memberships.map((item) => item.id)).toEqual(apiOrder);
    expect(screen.getAllByRole("link", { name: "Gán gói CSA" })).toHaveLength(1);
  });

  it("shows a retryable error when the customer detail request fails", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Request failed"));
    providers(<CSACustomerDetail customerId={customer.id} />);

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it.each(["", "Call before delivery.\nMorning only."])(
    "creates a customer with supported shipping areas and optional note %j",
    async (note) => {
      let resolveCreate!: (value: CSACustomer) => void;
      vi.mocked(api).mockImplementation(async (path) => {
        if (path === "public/shipping-areas?locale=en") return supportedShippingAreas as never;
        if (path === "admin/csa-customers") {
          return new Promise<CSACustomer>((resolve) => {
            resolveCreate = resolve;
          }) as never;
        }
        throw new Error(`Unexpected request: ${path}`);
      });

      const view = providers(<CSACustomerForm />);
      expect(screen.queryByRole("radio")).toBeNull();
      expect(screen.queryByRole("searchbox")).toBeNull();
      expect(view.container).not.toHaveTextContent("Package");
      expect(screen.queryByLabelText(/Farmbrite/)).toBeNull();

      const contact = screen.getByRole("group", { name: "Contact details" });
      expect(within(contact).getByLabelText("Name *")).toBeRequired();
      expect(within(contact).getByLabelText("Phone number *")).toBeRequired();
      const delivery = screen.getByRole("group", { name: "Delivery address" });
      expect(within(delivery).getByRole("combobox", { name: "Province/city" })).toBeRequired();
      expect(within(delivery).getByRole("combobox", { name: "Ward/commune" })).toBeRequired();
      expect(within(delivery).getByLabelText("Delivery address *")).toBeRequired();
      const noteInput = screen.getByRole("textbox", { name: "Note" });
      expect(noteInput).not.toBeRequired();
      expect(noteInput).toHaveAttribute("maxlength", "1000");
      const create = screen.getByRole("button", { name: "Create CSA customer" });
      const card = create.closest(".mantine-Paper-root");
      expect(card).toContainElement(contact);
      expect(card).toContainElement(delivery);
      expect(create.closest("footer")).toBeInTheDocument();

      await waitFor(() =>
        expect(screen.getByRole("combobox", { name: "Province/city" })).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole("button", { name: "Create CSA customer" }));
      expect(screen.getByText("Name is required.")).toBeVisible();
      expect(screen.getByText("Phone number is required.")).toBeVisible();
      expect(screen.getByText("Province/city is required.")).toBeVisible();
      expect(screen.getByText("Ward/commune is required.")).toBeVisible();
      expect(screen.getByText("Detailed address is required.")).toBeVisible();
      expect(api).toHaveBeenCalledTimes(1);
      expect(api).toHaveBeenCalledWith("public/shipping-areas?locale=en", expect.anything());
      expect(
        vi.mocked(api).mock.calls.some(([path]) => path.startsWith("administrative-units/")),
      ).toBe(false);

      fireEvent.change(screen.getByRole("textbox", { name: /Name/ }), {
        target: { value: customer.name },
      });
      const phone = screen.getByRole("textbox", { name: /Phone number/ });
      expect(phone).toHaveAttribute("type", "tel");
      expect(phone).toHaveAttribute("inputmode", "tel");
      expect(phone).toHaveAttribute("autocomplete", "tel");
      fireEvent.change(phone, { target: { value: "0123" } });
      fireEvent.click(screen.getByRole("button", { name: "Create CSA customer" }));
      expect(screen.getByText("Enter a valid phone number.")).toBeVisible();
      expect(vi.mocked(api).mock.calls.some(([path]) => path === "admin/csa-customers")).toBe(
        false,
      );
      fireEvent.change(phone, { target: { value: "0912345678" } });
      expect(phone).toHaveValue("0912345678");
      fireEvent.change(phone, { target: { value: "0912e345678" } });
      expect(phone).toHaveValue("0912345678");
      const province = await screen.findByRole("combobox", { name: /Province\/city/ });
      await waitFor(() =>
        expect(screen.getByRole("combobox", { name: "Province/city" })).toBeEnabled(),
      );
      selectOption(province, "79");
      const ward = screen.getByRole("combobox", { name: /Ward\/commune/ });
      selectOption(ward, "001");
      selectOption(province, "");
      expect(ward).toHaveValue("Choose a ward or commune");
      selectOption(province, "79");
      selectOption(ward, "001");
      fireEvent.change(screen.getByRole("textbox", { name: /Delivery address/ }), {
        target: { value: "12 Main Street" },
      });
      fireEvent.change(noteInput, { target: { value: note } });

      fireEvent.click(screen.getByRole("button", { name: "Create CSA customer" }));
      const saving = screen.getByRole("button", { name: "Saving…" });
      expect(saving).toBeDisabled();
      fireEvent.click(saving);
      await waitFor(() =>
        expect(
          vi.mocked(api).mock.calls.filter(([path]) => path === "admin/csa-customers"),
        ).toHaveLength(1),
      );
      const createCall = vi.mocked(api).mock.calls.find(([path]) => path === "admin/csa-customers");
      expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
        name: customer.name,
        phone: "+84912345678",
        province_code: "79",
        ward_code: "001",
        address: "12 Main Street",
        note,
      });
      expect(vi.mocked(api).mock.calls.some(([path]) => path.startsWith("admin/memberships"))).toBe(
        false,
      );

      resolveCreate({ ...customer, phone: "+84912345678" });
      await waitFor(() =>
        expect(navigation.replace).toHaveBeenCalledWith(`/csa-customers/${customer.id}`),
      );
    },
  );

  it("uses the Admin header style for creation and sorts shipping options by locality name", async () => {
    vi.mocked(api).mockResolvedValue([
      { province_code: "79", province_name: "Hồ Chí Minh", wards: [] },
      {
        province_code: "66",
        province_name: "Đắk Lắk",
        wards: [
          { ward_code: "003", ward_name: "Xã Hòa Thắng", shipping_fee_vnd: "30000" },
          { ward_code: "020", ward_name: "Phường 20", shipping_fee_vnd: "30000" },
          { ward_code: "002", ward_name: "Phường 2", shipping_fee_vnd: "30000" },
          { ward_code: "001", ward_name: "Xã An Bình", shipping_fee_vnd: "30000" },
        ],
      },
      { province_code: "01", province_name: "Hà Nội", wards: [] },
    ] as never);
    const dictionary = adminDictionaries.vi;
    const active = adminNavigation(dictionary)
      .flatMap((section) => section.items)
      .find((item) => item.href === "/csa-customers");
    providers(
      <>
        <header>
          <AdminHeaderContent
            items={resolveAdminBreadcrumbs("/csa-customers/new", active, dictionary)}
          />
        </header>
        <main>
          <CreateCustomerPage />
        </main>
      </>,
      "vi",
    );
    const header = within(screen.getByRole("banner"));
    expect(header.getByText("Tạo khách hàng CSA")).toHaveAttribute("aria-current", "page");
    expect(header.getByRole("link", { name: "Khách hàng CSA" })).toHaveAttribute(
      "href",
      "/csa-customers",
    );
    const body = within(screen.getByRole("main"));
    expect(body.queryByRole("link", { name: "Khách hàng CSA" })).not.toBeInTheDocument();
    expect(body.getByRole("heading", { name: "Tạo khách hàng CSA", level: 1 })).toHaveClass(
      "mantine-VisuallyHidden-root",
    );
    const province = screen.getByRole("combobox", { name: /Tỉnh/ });
    await waitFor(() => expect(province).toBeEnabled());
    fireEvent.click(province);
    const provinces = screen.getAllByRole("option");
    expect(provinces.slice(1).map((option) => option.textContent)).toEqual([
      "Đắk Lắk",
      "Hà Nội",
      "Hồ Chí Minh",
    ]);
    fireEvent.click(provinces[1]);
    fireEvent.click(screen.getByRole("combobox", { name: /Phường/ }));
    expect(
      screen
        .getAllByRole("option")
        .slice(1)
        .map((option) => option.textContent),
    ).toEqual(["Phường 2", "Phường 20", "Xã An Bình", "Xã Hòa Thắng"]);
  });

  it("keeps the create form intact and reports a duplicate-phone conflict", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "public/shipping-areas?locale=en") return supportedShippingAreas as never;
      if (path === "admin/csa-customers") throw new Error("csa_customer_phone_exists");
      throw new Error(`Unexpected request: ${path}`);
    });
    const view = providers(<CSACustomerForm />);
    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: customer.name } });
    fireEvent.change(screen.getByLabelText("Phone number *"), { target: { value: "0912345678" } });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Province/city" })).toBeEnabled(),
    );
    selectOption(screen.getByRole("combobox", { name: "Province/city" }), "79");
    selectOption(screen.getByRole("combobox", { name: "Ward/commune" }), "001");
    fireEvent.change(screen.getByLabelText("Delivery address *"), {
      target: { value: "12 Main Street" },
    });
    const note = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(note, { target: { value: "Call before delivery." } });
    fireEvent.click(screen.getByRole("button", { name: "Create CSA customer" }));

    const duplicateError = await screen.findByText(
      "This phone number belongs to another CSA customer.",
    );
    const phoneInput = screen.getByLabelText(/Phone number/);
    expect(duplicateError).toHaveClass("mantine-TextInput-error");
    expect(phoneInput).toHaveAttribute("aria-invalid", "true");
    expect(phoneInput).toHaveAttribute("aria-describedby", duplicateError.id);
    expect(phoneInput.closest(".mantine-TextInput-root")).toContainElement(duplicateError);
    await waitFor(() => expect(phoneInput).toHaveFocus());
    expect(phoneInput).toHaveValue("0912345678");
    expect(note).toHaveValue("Call before delivery.");
    expect(
      [...view.container.querySelectorAll(".error-box")].some((box) =>
        box.textContent?.includes("This phone number belongs to another CSA customer."),
      ),
    ).toBe(false);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("keeps the link dialog open when the backend reports a user conflict", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path.endsWith("link-user")) throw new Error("csa_customer_user_exists");
      return customer;
    });
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [
        {
          id: "58cbea40-4749-4400-9fa3-188de573abaf",
          name: "Web User",
          email: "web@example.com",
          login_phone_number: null,
          has_csa_customer: false,
          phone: "0909000000",
          status: "active",
          date_joined: "",
          points_balance: 0,
        },
      ],
      meta,
    });
    providers(<CSACustomerDetail customerId={customer.id} />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Link account" }))[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("searchbox"), {
      target: { value: "web@example.com" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Search" }));
    fireEvent.click(await within(dialog).findByRole("radio"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm link" }));
    expect(
      await within(dialog).findByText("This account is linked to another CSA customer."),
    ).toBeVisible();
  });

  it("explains that a supported delivery address is required before linking", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path.endsWith("link-user")) {
        throw new Error("csa_customer_shipping_address_unavailable");
      }
      return customer;
    });
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [
        {
          id: "58cbea40-4749-4400-9fa3-188de573abaf",
          name: "Web User",
          email: "web@example.com",
          login_phone_number: null,
          has_csa_customer: false,
          phone: "0909000000",
          status: "active",
          date_joined: "",
          points_balance: 0,
        },
      ],
      meta,
    });
    providers(<CSACustomerDetail customerId={customer.id} />, "vi");
    fireEvent.click((await screen.findAllByRole("button", { name: "Liên kết tài khoản" }))[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("searchbox"), {
      target: { value: "web@example.com" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Tìm kiếm" }));
    fireEvent.click(await within(dialog).findByRole("radio"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận liên kết" }));

    expect(
      await within(dialog).findByText(
        "Tài khoản chưa có địa chỉ giao hàng đang được hỗ trợ. Hãy cập nhật địa chỉ trước khi liên kết.",
      ),
    ).toBeVisible();
  });

  it("requires a customerId and never falls back to a customer picker", () => {
    providers(<MembershipAssignmentForm />);

    expect(
      screen.getByText("Please choose a CSA customer before assigning a package."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to CSA customers" })).toHaveAttribute(
      "href",
      "/csa-customers",
    );
    expect(screen.queryByRole("button", { name: "Assign CSA package" })).toBeNull();
    expect(screen.queryByRole("searchbox", { name: /customer/i })).toBeNull();
    expect(api).not.toHaveBeenCalled();
    expect(apiEnvelope).not.toHaveBeenCalled();
  });

  it("does not render or enable assignment when the customer fetch fails", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Customer not found"));
    const path = "/memberships/assign";
    const search = {
      customerId: customer.id,
      search: "Lan",
      linked: "managed",
      membership_status: "active",
      page: "2",
    };
    const query = new URLSearchParams(search).toString();
    window.history.replaceState(null, "", `${path}?${query}`);
    function Breadcrumb() {
      const [list] = useAdminBreadcrumbs([]);
      return list && <a href={list.href}>{list.label}</a>;
    }
    providers(
      <AdminBreadcrumbProvider pathname={path} search={query}>
        <Breadcrumb />
        {await AssignMembershipPage({ searchParams: Promise.resolve(search) })}
      </AdminBreadcrumbProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The request failed. Please try again.",
    );
    expect(screen.getByRole("link", { name: "Back to CSA customers" })).toHaveAttribute(
      "href",
      "/csa-customers?search=Lan&linked=managed&membership_status=active&page=2",
    );
    expect(screen.getByRole("link", { name: "CSA customers" })).toHaveAttribute(
      "href",
      "/csa-customers?search=Lan&linked=managed&membership_status=active&page=2",
    );
    expect(screen.queryByRole("button", { name: "Assign CSA package" })).toBeNull();
    expect(apiEnvelope).not.toHaveBeenCalled();
  });

  it("shows localized province and ward names in the assignment customer summary", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === `admin/csa-customers/${customer.id}`) return customer;
      if (path === "administrative-units/provinces") {
        return [{ code: "79", name: "Ho Chi Minh City" }] as never;
      }
      if (path === "administrative-units/wards?province=79") {
        return [{ code: "001", name: "Ben Nghe Ward" }] as never;
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta });

    providers(<MembershipAssignmentForm customerId={customer.id} />, "en");

    expect(await screen.findByText("Ho Chi Minh City")).toBeVisible();
    expect(screen.getByText("Ben Nghe Ward")).toBeVisible();
    expect(screen.queryByText("79")).toBeNull();
    expect(screen.queryByText("001")).toBeNull();
    expect(api).toHaveBeenCalledWith(
      "administrative-units/provinces",
      expect.objectContaining({ headers: { "Accept-Language": "en" } }),
    );
    expect(api).toHaveBeenCalledWith(
      "administrative-units/wards?province=79",
      expect.objectContaining({ headers: { "Accept-Language": "en" } }),
    );
  });

  it("does not request wards when the assignment customer has no province code", async () => {
    vi.mocked(api).mockResolvedValue({
      ...customer,
      province_code: null,
      ward_code: null,
    });
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta });

    providers(<MembershipAssignmentForm customerId={customer.id} />);

    await screen.findByText("There are no active CSA packages.");
    expect(
      vi
        .mocked(api)
        .mock.calls.some(([path]) => path.startsWith("administrative-units/wards?province=")),
    ).toBe(false);
  });

  it.each([
    {
      locale: "vi" as const,
      translations: [
        { locale: "vi" as const, name: "Gói tiếng Việt", description: "Mô tả tiếng Việt" },
        { locale: "en" as const, name: "English package", description: "English description" },
      ],
      expectedName: "Gói tiếng Việt",
      expectedDescription: "Mô tả tiếng Việt",
    },
    {
      locale: "en" as const,
      translations: [
        { locale: "vi" as const, name: "Gói tiếng Việt", description: "Mô tả tiếng Việt" },
        { locale: "en" as const, name: "English package", description: "English description" },
      ],
      expectedName: "English package",
      expectedDescription: "English description",
    },
    {
      locale: "en" as const,
      translations: [
        { locale: "vi" as const, name: "Gói dự phòng", description: "Mô tả dự phòng" },
      ],
      expectedName: "Gói dự phòng",
      expectedDescription: "Mô tả dự phòng",
    },
    {
      locale: "en" as const,
      translations: [],
      expectedName: "Default package name",
      expectedDescription: "Default package description",
    },
  ])(
    "renders localized package content with $locale locale and the required fallback order",
    async ({ locale, translations, expectedName, expectedDescription }) => {
      const price = {
        id: "localized-price",
        duration_months: 3,
        monthly_price_vnd: "500000",
        total_price_vnd: "1500000",
        is_active: true,
        sort_order: 0,
        created_at: "",
        updated_at: "",
      };
      vi.mocked(api).mockResolvedValue(customer);
      vi.mocked(apiEnvelope).mockResolvedValue({
        data: [
          {
            id: "localized-package",
            name: "Default package name",
            description: "Default package description",
            translations: [...translations],
            price_options: [price],
            quota_policy: "expire",
            items: [],
            is_active: true,
            created_at: "",
            updated_at: "",
          },
        ],
        meta,
      });

      providers(<MembershipAssignmentForm customerId={customer.id} />, locale);

      expect(await screen.findByRole("radio", { name: new RegExp(expectedName) })).toBeEnabled();
      expect(screen.getByText(expectedDescription)).toBeVisible();
      expect(
        screen.getByRole("textbox", { name: locale === "vi" ? "Mã đơn hàng" : "Order reference" }),
      ).toBeRequired();
      expect(screen.queryByText("Mã đơn hàng Farmbrite *")).toBeNull();
      expect(screen.queryByText("Farmbrite order reference *")).toBeNull();
      expect(apiEnvelope).toHaveBeenCalledWith(
        "admin/membership-packages?active=true&page=1",
        expect.anything(),
      );
    },
  );

  it("loads packages once and only enables assignment after all required selections", async () => {
    const price = {
      id: "p1",
      duration_months: 3,
      monthly_price_vnd: "500000",
      total_price_vnd: "1500000",
      is_active: true,
      sort_order: 0,
      created_at: "",
      updated_at: "",
    };
    const packageItem = {
      id: "pkg1",
      name: "Gói mặc định",
      description: "Mô tả mặc định",
      translations: [
        { locale: "vi" as const, name: "Gói ba tháng", description: "Mô tả tiếng Việt" },
        { locale: "en" as const, name: "English three-month package", description: "English copy" },
      ],
      price_options: [price],
      quota_policy: "expire" as const,
      items: [],
      is_active: true,
      created_at: "",
      updated_at: "",
    };
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [packageItem], meta });
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-customers/${customer.id}` && !init?.method) return customer;
      return { id: "membership-1" } as never;
    });
    const view = providers(<MembershipAssignmentForm customerId={customer.id} />);
    expect(await screen.findByText(customer.name)).toBeVisible();
    const customerHeading = screen.getByRole("heading", { name: "Customer" });
    const packageHeading = screen.getByRole("heading", { name: "CSA package information" });
    const historyHeading = screen.getByRole("heading", { name: "Customer's existing packages" });
    expect(
      customerHeading.compareDocumentPosition(packageHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      packageHeading.compareDocumentPosition(historyHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(view.container.querySelector(".assignment-layout")).toBeNull();
    expect(view.container.querySelector(".form-grid:not(.one)")).toBeNull();
    expect(
      customerHeading.closest("section")?.querySelector("input, select, textarea, button"),
    ).toBeNull();
    expect(screen.getByText(customer.address)).toBeVisible();
    expect(screen.queryByRole("searchbox", { name: /customer/i })).toBeNull();
    expect(screen.queryByRole("search")).toBeNull();
    expect(screen.queryByText("Search active CSA packages")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Price option" })).toBeVisible();
    const orderReferenceInput = screen.getByRole("textbox", { name: "Order reference" });
    expect(orderReferenceInput).toBeRequired();
    expect(screen.queryByText("Farmbrite order reference *")).toBeNull();
    expect(
      screen.getByText("An order reference is required to assign the CSA package."),
    ).toBeVisible();
    const startDateInput = screen.getByLabelText(/Start date/);
    expect(startDateInput).toBeDisabled();
    expect(startDateInput).toHaveAttribute("type", "text");
    expect(startDateInput).toHaveAttribute("inputmode", "numeric");
    expect(startDateInput).toHaveAttribute("placeholder", "dd/mm/yyyy");
    const pickerButton = screen.getByRole("button", { name: "Open start date picker" });
    expect(pickerButton).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Customer details" })).toBeNull();
    const assignButton = screen.getByRole("button", { name: "Assign CSA package" });
    expect(assignButton).toBeDisabled();
    fireEvent.click(await screen.findByRole("radio", { name: /English three-month package/ }));
    expect(assignButton).toBeDisabled();
    selectOption(screen.getByRole("textbox", { name: "Price option" }), price.id);
    expect(startDateInput).toBeEnabled();
    expect(pickerButton).toBeEnabled();
    fireEvent.change(startDateInput, { target: { value: "29042099" } });
    fireEvent.click(pickerButton);
    fireEvent.click(screen.getByRole("button", { name: "30 April 2099" }));
    expect(startDateInput).toHaveValue("30/04/2099");
    fireEvent.change(startDateInput, { target: { value: "" } });
    expect(assignButton).toBeDisabled();
    fireEvent.change(orderReferenceInput, {
      target: { value: "FB-100" },
    });
    expect(assignButton).toBeDisabled();
    fireEvent.change(startDateInput, { target: { value: "01/05/2099" } });
    expect(startDateInput).toHaveValue("01/05/2099");
    expect(assignButton).toBeEnabled();
    fireEvent.click(assignButton);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("English three-month package")).toBeVisible();
    expect(within(dialog).getByText("FB-100")).toBeVisible();
    expect(within(dialog).getByText("31/07/2099")).toBeVisible();
    expect(within(dialog).queryByText("Gói mặc định")).toBeNull();
    const confirmButton = within(dialog).getByRole("button", {
      name: "Assign CSA package",
    });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        expect.stringContaining("admin/memberships"),
        expect.anything(),
      ),
    );
    const body = JSON.parse(String(vi.mocked(api).mock.calls.at(-1)?.[1]?.body));
    expect(body).toMatchObject({
      customer_id: customer.id,
      package_id: packageItem.id,
      price_option_id: price.id,
      start_date: "2099-05-01",
      farmbrite_order_reference: "FB-100",
    });
    expect(body).not.toHaveProperty("user_id");
    expect(api).toHaveBeenCalledWith(`admin/csa-customers/${customer.id}`, expect.anything());
    expect(
      vi.mocked(apiEnvelope).mock.calls.some(([path]) => path.startsWith("admin/csa-customers")),
    ).toBe(false);
    expect(apiEnvelope).toHaveBeenCalledTimes(1);
    expect(apiEnvelope).toHaveBeenCalledWith(
      "admin/membership-packages?active=true&page=1",
      expect.anything(),
    );
    expect(vi.mocked(apiEnvelope).mock.calls[0]?.[0]).not.toContain("search=");
    expect(vi.mocked(apiEnvelope).mock.calls[0]?.[0]).not.toContain("locale=");
    expect(
      vi.mocked(api).mock.calls.filter(([path]) => path.startsWith("admin/memberships")),
    ).toHaveLength(1);
    expect(navigation.replace).toHaveBeenCalledWith(`/csa-customers/${customer.id}`);
  });

  it("keeps the assignment draft editable when a package refresh fails during confirmation", async () => {
    const price = {
      id: "available-price",
      duration_months: 3,
      monthly_price_vnd: "500000",
      total_price_vnd: "1500000",
      is_active: true,
      sort_order: 0,
      created_at: "",
      updated_at: "",
    };
    const packages = {
      data: [
        {
          id: "available-package",
          name: "Available package",
          description: "",
          translations: [],
          price_options: [price],
          quota_policy: "expire",
          items: [],
          is_active: true,
          created_at: "",
          updated_at: "",
        },
      ],
      meta,
    };
    vi.mocked(api).mockResolvedValue(customer);
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce(packages)
      .mockRejectedValueOnce(Object.assign(new Error("upstream_unavailable"), { status: 503 }))
      .mockResolvedValueOnce(packages);
    providers(<MembershipAssignmentForm customerId={customer.id} />);

    fireEvent.click(await screen.findByRole("radio", { name: /Available package/ }));
    selectOption(screen.getByRole("textbox", { name: "Price option" }), price.id);
    const orderInput = screen.getByRole("textbox", { name: "Order reference" });
    fireEvent.change(orderInput, { target: { value: "FB-RETRY" } });
    fireEvent.change(screen.getByLabelText(/Start date/), { target: { value: "01/05/2099" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign CSA package" }));
    expect(screen.getByRole("dialog")).toBeVisible();

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    const retryButton = await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(retryButton.closest("[inert]")).toBeNull();
    expect(orderInput).toHaveValue("FB-RETRY");
    fireEvent.click(retryButton);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Assign CSA package" })).toBeEnabled(),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a duplicate order reference as an inline accessible field error", async () => {
    const price = {
      id: "duplicate-price",
      duration_months: 3,
      monthly_price_vnd: "500000",
      total_price_vnd: "1500000",
      is_active: true,
      sort_order: 0,
      created_at: "",
      updated_at: "",
    };
    const packageItem = {
      id: "duplicate-package",
      name: "Gói ba tháng",
      description: "",
      translations: [],
      price_options: [price],
      quota_policy: "expire" as const,
      items: [],
      is_active: true,
      created_at: "",
      updated_at: "",
    };
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [packageItem], meta });
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-customers/${customer.id}` && !init?.method) return customer;
      if (path.startsWith("admin/memberships")) {
        throw new Error("duplicate_farmbrite_order_reference");
      }
      return [] as never;
    });
    const view = providers(<MembershipAssignmentForm customerId={customer.id} />, "vi");

    const orderReferenceInput = await screen.findByRole("textbox", { name: "Mã đơn hàng" });
    expect(view.container).not.toHaveTextContent(/Farmbrite/i);
    fireEvent.blur(orderReferenceInput);
    expect(await screen.findByText("Vui lòng nhập mã đơn hàng.")).toBeVisible();
    expect(orderReferenceInput).toHaveAttribute("aria-invalid", "true");

    fireEvent.click(screen.getByRole("radio", { name: /Gói ba tháng/ }));
    selectOption(screen.getByRole("textbox", { name: "Lựa chọn giá" }), price.id);
    fireEvent.change(orderReferenceInput, { target: { value: "ORDER-100" } });
    fireEvent.change(screen.getByLabelText(/Ngày bắt đầu/), { target: { value: "01/05/2099" } });
    fireEvent.click(screen.getByRole("button", { name: "Gán gói CSA" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Gán gói CSA" }),
    );

    const duplicateError = await screen.findByText("Mã đơn hàng này đã được sử dụng.");
    expect(duplicateError).toBeVisible();
    expect(orderReferenceInput).toHaveAttribute("aria-invalid", "true");
    expect(orderReferenceInput).toHaveAccessibleDescription("Mã đơn hàng này đã được sử dụng.");
    await waitFor(() => expect(orderReferenceInput).toHaveFocus());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      [...view.container.querySelectorAll(".error-box")].some((box) =>
        box.textContent?.includes("Mã đơn hàng này đã được sử dụng."),
      ),
    ).toBe(false);
    expect(view.container).not.toHaveTextContent(/Farmbrite/i);

    const membershipCall = vi
      .mocked(api)
      .mock.calls.find(([path]) => path.startsWith("admin/memberships"));
    expect(JSON.parse(String(membershipCall?.[1]?.body))).toMatchObject({
      farmbrite_order_reference: "ORDER-100",
    });
  });

  it("disables packages without active price options and resets the option when package changes", async () => {
    const firstActiveOption = {
      id: "price-first",
      duration_months: 3,
      monthly_price_vnd: "500000",
      total_price_vnd: "1500000",
      is_active: true,
      sort_order: 0,
      created_at: "",
      updated_at: "",
    };
    const inactiveOption = { ...firstActiveOption, id: "price-inactive", is_active: false };
    const secondActiveOption = {
      ...firstActiveOption,
      id: "price-second",
      duration_months: 6,
      total_price_vnd: "3000000",
    };
    const packages = [
      {
        id: "package-first",
        name: "First active package",
        description: "First description",
        translations: [],
        price_options: [firstActiveOption, inactiveOption],
        quota_policy: "expire" as const,
        items: [],
        is_active: true,
        created_at: "",
        updated_at: "",
      },
      {
        id: "package-second",
        name: "Second active package",
        description: "Second description",
        translations: [],
        price_options: [secondActiveOption],
        quota_policy: "expire" as const,
        items: [],
        is_active: true,
        created_at: "",
        updated_at: "",
      },
      {
        id: "package-no-options",
        name: "Package without duration",
        description: "Not selectable",
        translations: [],
        price_options: [inactiveOption],
        quota_policy: "expire" as const,
        items: [],
        is_active: true,
        created_at: "",
        updated_at: "",
      },
      {
        id: "package-inactive",
        name: "Inactive package",
        description: "Hidden",
        translations: [],
        price_options: [firstActiveOption],
        quota_policy: "expire" as const,
        items: [],
        is_active: false,
        created_at: "",
        updated_at: "",
      },
    ];
    vi.mocked(api).mockResolvedValue(customer);
    vi.mocked(apiEnvelope).mockResolvedValue({ data: packages, meta });
    providers(<MembershipAssignmentForm customerId={customer.id} />);

    const unavailablePackage = await screen.findByRole("radio", {
      name: /Package without duration/,
    });
    expect(unavailablePackage).toBeDisabled();
    expect(screen.getByText("This package currently has no duration option.")).toBeVisible();
    expect(screen.queryByText("Inactive package")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /First active package/ }));
    const optionSelect = screen.getByRole("textbox", { name: "Price option" });
    expect(optionSelect).toBeEnabled();
    fireEvent.click(optionSelect);
    expect(
      screen
        .getAllByRole("option")
        .some((option) => option.getAttribute("value") === "price-inactive"),
    ).toBe(false);
    fireEvent.keyDown(optionSelect, { key: "Escape" });
    selectOption(optionSelect, firstActiveOption.id);
    expect(optionSelect).toHaveValue("3 months · ₫500,000/month");

    fireEvent.click(screen.getByRole("radio", { name: /Second active package/ }));
    expect(optionSelect).toHaveValue("");
    expect(optionSelect).toHaveAttribute("placeholder", "Choose an active duration and price");
    expect(screen.getByRole("button", { name: "Assign CSA package" })).toBeDisabled();
  });

  it("keeps overlap validation in the vertical assignment form", async () => {
    const price = {
      id: "p-overlap",
      duration_months: 3,
      monthly_price_vnd: "500000",
      total_price_vnd: "1500000",
      is_active: true,
      sort_order: 0,
      created_at: "",
      updated_at: "",
    };
    const packageItem = {
      id: "pkg-overlap",
      name: "CSA overlap package",
      description: "",
      translations: [],
      price_options: [price],
      quota_policy: "expire" as const,
      items: [],
      is_active: true,
      created_at: "",
      updated_at: "",
    };
    const customerWithSchedule = {
      ...customer,
      memberships: [
        membership("future", "Existing package", "scheduled", "2099-01-01", "2099-04-01"),
      ],
    };
    vi.mocked(api).mockResolvedValue(customerWithSchedule);
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [packageItem], meta });
    providers(<MembershipAssignmentForm customerId={customer.id} />);

    fireEvent.click(await screen.findByRole("radio", { name: /CSA overlap package/ }));
    selectOption(screen.getByRole("textbox", { name: "Price option" }), price.id);
    fireEvent.change(screen.getByRole("textbox", { name: "Order reference" }), {
      target: { value: "FB-OVERLAP" },
    });
    const startDateInput = screen.getByLabelText(/Start date/);
    fireEvent.change(startDateInput, { target: { value: "01/01/2020" } });
    expect(startDateInput).toHaveAttribute("aria-invalid", "true");
    expect(startDateInput).toHaveAccessibleDescription(/start date must be/i);
    expect(screen.getByRole("button", { name: "Assign CSA package" })).toBeDisabled();
    fireEvent.change(startDateInput, { target: { value: "01/02/2099" } });

    expect(screen.getByRole("status")).toHaveTextContent(/overlap|conflict/i);
    expect(startDateInput).toHaveAccessibleDescription(/must be .* or later/i);
    expect(screen.getByRole("button", { name: "Assign CSA package" })).toBeDisabled();
    expect(vi.mocked(api).mock.calls.some(([path]) => path.startsWith("admin/memberships"))).toBe(
      false,
    );
  });

  it("shows the backend incomplete-customer error without creating another customer", async () => {
    const price = {
      id: "p1",
      duration_months: 3,
      monthly_price_vnd: "500000",
      total_price_vnd: "1500000",
      is_active: true,
      sort_order: 0,
      created_at: "",
      updated_at: "",
    };
    const packageItem = {
      id: "pkg1",
      name: "CSA 3 months",
      description: "",
      translations: [],
      price_options: [price],
      quota_policy: "expire" as const,
      items: [],
      is_active: true,
      created_at: "",
      updated_at: "",
    };
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [packageItem], meta });
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/csa-customers/${customer.id}` && !init?.method) return customer;
      if (path.startsWith("admin/memberships")) throw new Error("csa_customer_incomplete");
      throw new Error(`Unexpected request: ${path}`);
    });
    providers(<MembershipAssignmentForm customerId={customer.id} />);
    expect(await screen.findByText(customer.name)).toBeVisible();
    fireEvent.click(await screen.findByRole("radio", { name: /CSA 3 months/ }));
    selectOption(screen.getByRole("textbox", { name: "Price option" }), price.id);
    fireEvent.change(screen.getByRole("textbox", { name: "Order reference" }), {
      target: { value: "FB-INCOMPLETE" },
    });
    fireEvent.change(screen.getByLabelText(/Start date/), { target: { value: "01/05/2099" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign CSA package" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Assign CSA package" }),
    );

    expect(
      await screen.findByText(
        "This customer is missing required information. Complete the customer profile before assigning a package.",
      ),
    ).toBeVisible();
    expect(
      vi
        .mocked(api)
        .mock.calls.some(([path, init]) =>
          Boolean(path === "admin/csa-customers" && init?.method === "POST"),
        ),
    ).toBe(false);
    expect(screen.queryByRole("link", { name: "Customer details" })).toBeNull();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
