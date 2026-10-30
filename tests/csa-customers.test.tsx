import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { CSACustomerDetail } from "@/components/csa-customer-detail";
import { CSACustomerForm } from "@/components/csa-customer-form";
import { CSACustomerList } from "@/components/csa-customer-list";
import { MembershipAssignmentForm } from "@/components/membership-assignment-form";
import { ToastProvider } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import type { AdminMembership, CSACustomer, MembershipStatus, PaginationMeta } from "@/lib/types";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, refresh: vi.fn() }),
  usePathname: () => "/csa-customers",
  useSearchParams: () => new URLSearchParams(),
}));
afterEach(() => {
  cleanup();
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
      <ToastProvider>{child}</ToastProvider>
    </AdminI18nProvider>,
  );
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

  it("renders only the supported customer columns and one row action", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [customer], meta });
    const view = providers(<CSACustomerList />);

    expect(await screen.findByText(customer.name)).toBeVisible();
    const detailLink = screen.getByRole("link", { name: "View details" });
    expect(detailLink).toHaveAttribute("href", `/csa-customers/${customer.id}`);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(apiEnvelope).toHaveBeenCalledWith(expect.stringContaining("linked=all"));
    expect(screen.getAllByText("Managed manually").length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: "Customer" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Phone number" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Website account" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "Latest CSA package" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Last collection date" })).toBeNull();
    expect(view.container).not.toHaveTextContent("No data yet");
    const cells = within(screen.getByRole("row", { name: /Lan Nguyen/ })).getAllByRole("cell");
    expect(cells).toHaveLength(5);
    expect(cells.map((cell) => cell.getAttribute("data-label"))).toEqual([
      "Customer",
      "Phone number",
      "Website account",
      "Status",
      "Actions",
    ]);
    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    expect(view.container.querySelector(".admin-list-wrap")).toBeInTheDocument();
    expect(view.container.querySelector(".customer-list-table")).toBeInTheDocument();
  });

  it("applies account and package-status filters and only shows reset while active", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [customer], meta });
    providers(<CSACustomerList />);
    await screen.findByText(customer.name);

    fireEvent.change(screen.getByLabelText("Website account"), { target: { value: "linked" } });
    fireEvent.change(screen.getByLabelText("CSA package status"), {
      target: { value: "active" },
    });

    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenCalledWith(
        expect.stringMatching(/linked=linked.*membership_status=active/),
      ),
    );
    const reset = screen.getByRole("button", { name: "Clear filters" });
    fireEvent.click(reset);
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith(
        expect.stringMatching(/page=1.*page_size=30.*linked=all$/),
      ),
    );
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("uses the common back link and presents a read-only account with one assignment action", async () => {
    vi.mocked(api).mockResolvedValue(customer);
    const view = providers(<CSACustomerDetail customerId={customer.id} />);

    expect(screen.getByText("Loading customer details…")).toBeVisible();
    const account = await screen.findByRole("heading", { name: "Account information" });
    const history = screen.getByRole("heading", { name: "Purchased package history" });
    expect(
      account.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const back = screen.getByRole("link", { name: "CSA customers" });
    expect(back).toHaveClass("detail-back-link");
    expect(back).toHaveAttribute("href", "/csa-customers");
    expect(back.querySelector("svg")).toBeInTheDocument();
    const assign = screen.getAllByRole("link", { name: "Assign CSA package" });
    expect(assign).toHaveLength(1);
    expect(assign[0]).toHaveAttribute("href", `/memberships/assign?customerId=${customer.id}`);
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Link account" })).toBeVisible();
    expect(screen.getByText("Customer without an account")).toBeVisible();
    expect(screen.getByText("This customer has not purchased a CSA package.")).toBeVisible();
    expect(screen.queryByRole("link", { name: "View details" })).toBeNull();
    expect(view.container.querySelector(".customer-membership-list")).toBeNull();
    const accountList = view.container.querySelector(".customer-account-list");
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
    const view = providers(<CSACustomerDetail customerId={customer.id} />, "vi");

    await screen.findByRole("heading", { name: "Lịch sử các gói đã mua" });
    const items = [...view.container.querySelectorAll<HTMLElement>(".customer-membership-item")];
    expect(items).toHaveLength(6);
    expect(items.map((item) => within(item).getByRole("heading").textContent)).toEqual([
      "Future package",
      "Same date first",
      "Same date second",
      "Older package",
      "Invalid date package",
      "Missing date package",
    ]);
    expect(view.container.querySelector(".customer-membership-list")).toBeInTheDocument();
    expect(view.container.querySelector(".customer-package-grid")).toBeNull();
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

  it("creates a customer with the same supported shipping areas used by guest CSA", async () => {
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

    await screen.findByRole("option", { name: "Ho Chi Minh City" });
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
    expect(vi.mocked(api).mock.calls.some(([path]) => path === "admin/csa-customers")).toBe(false);
    fireEvent.change(phone, { target: { value: "0912345678" } });
    expect(phone).toHaveValue("0912345678");
    fireEvent.change(phone, { target: { value: "0912e345678" } });
    expect(phone).toHaveValue("0912345678");
    const province = await screen.findByRole("combobox", { name: /Province\/city/ });
    await screen.findByRole("option", { name: "Ho Chi Minh City" });
    fireEvent.change(province, { target: { value: "79" } });
    const ward = screen.getByRole("combobox", { name: /Ward\/commune/ });
    await screen.findByRole("option", { name: "Ben Nghe Ward" });
    fireEvent.change(ward, { target: { value: "001" } });
    fireEvent.change(province, { target: { value: "" } });
    expect(ward).toHaveValue("");
    fireEvent.change(province, { target: { value: "79" } });
    await screen.findByRole("option", { name: "Ben Nghe Ward" });
    fireEvent.change(ward, { target: { value: "001" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Delivery address/ }), {
      target: { value: "12 Main Street" },
    });

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
    });
    expect(vi.mocked(api).mock.calls.some(([path]) => path.startsWith("admin/memberships"))).toBe(
      false,
    );

    resolveCreate({ ...customer, phone: "+84912345678" });
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(`/csa-customers/${customer.id}`),
    );
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
    await screen.findByRole("option", { name: "Ho Chi Minh City" });
    fireEvent.change(screen.getByLabelText("Province/city *"), { target: { value: "79" } });
    await screen.findByRole("option", { name: "Ben Nghe Ward" });
    fireEvent.change(screen.getByLabelText("Ward/commune *"), { target: { value: "001" } });
    fireEvent.change(screen.getByLabelText("Delivery address *"), {
      target: { value: "12 Main Street" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create CSA customer" }));

    const duplicateError = await screen.findByText(
      "This phone number belongs to another CSA customer.",
    );
    const phoneInput = screen.getByLabelText(/Phone number/);
    expect(duplicateError).toHaveClass("field-error");
    expect(phoneInput).toHaveAttribute("aria-invalid", "true");
    expect(phoneInput).toHaveAttribute("aria-describedby", duplicateError.id);
    expect(phoneInput.nextElementSibling).toBe(duplicateError);
    expect(phoneInput).toHaveValue("0912345678");
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

    providers(<MembershipAssignmentForm customerId={customer.id} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The request failed. Please try again.",
    );
    expect(screen.getByRole("link", { name: "Back to CSA customers" })).toHaveAttribute(
      "href",
      "/csa-customers",
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
        screen.getByLabelText(locale === "vi" ? "Mã đơn hàng" : "Order reference"),
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
    expect(screen.getByLabelText("Price option *")).toBeVisible();
    const orderReferenceInput = screen.getByLabelText("Order reference");
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
    fireEvent.change(screen.getByLabelText("Price option *"), { target: { value: price.id } });
    expect(startDateInput).toBeEnabled();
    expect(pickerButton).toBeEnabled();
    const picker = view.container.querySelector<HTMLInputElement>('input[type="date"]');
    expect(picker).not.toBeNull();
    expect(picker).toHaveAttribute("min", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    fireEvent.change(picker!, { target: { value: "2099-04-30" } });
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

    const orderReferenceInput = await screen.findByLabelText("Mã đơn hàng");
    expect(view.container).not.toHaveTextContent(/Farmbrite/i);
    fireEvent.blur(orderReferenceInput);
    expect(await screen.findByText("Vui lòng nhập mã đơn hàng.")).toBeVisible();
    expect(orderReferenceInput).toHaveAttribute("aria-invalid", "true");

    fireEvent.click(screen.getByRole("radio", { name: /Gói ba tháng/ }));
    fireEvent.change(screen.getByLabelText("Lựa chọn giá *"), { target: { value: price.id } });
    fireEvent.change(orderReferenceInput, { target: { value: "ORDER-100" } });
    fireEvent.change(screen.getByLabelText(/Ngày bắt đầu/), { target: { value: "01/05/2099" } });
    fireEvent.click(screen.getByRole("button", { name: "Gán gói CSA" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Gán gói CSA" }),
    );

    const duplicateError = await screen.findByText("Mã đơn hàng này đã được sử dụng.");
    expect(duplicateError).toHaveClass("field-error");
    expect(orderReferenceInput.nextElementSibling).toBe(duplicateError);
    expect(orderReferenceInput).toHaveAttribute("aria-invalid", "true");
    expect(orderReferenceInput).toHaveAttribute("aria-describedby", duplicateError.id);
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
    const optionSelect = screen.getByLabelText("Price option *");
    expect(optionSelect).toBeEnabled();
    expect(optionSelect.querySelector('option[value="price-inactive"]')).toBeNull();
    fireEvent.change(optionSelect, { target: { value: firstActiveOption.id } });
    expect(optionSelect).toHaveValue(firstActiveOption.id);

    fireEvent.click(screen.getByRole("radio", { name: /Second active package/ }));
    expect(optionSelect).toHaveValue("");
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
    fireEvent.change(screen.getByLabelText("Price option *"), { target: { value: price.id } });
    fireEvent.change(screen.getByLabelText("Order reference"), {
      target: { value: "FB-OVERLAP" },
    });
    const startDateInput = screen.getByLabelText(/Start date/);
    fireEvent.change(startDateInput, { target: { value: "01/01/2020" } });
    expect(startDateInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/start date must be/i)).toHaveClass("field-error");
    expect(screen.getByRole("button", { name: "Assign CSA package" })).toBeDisabled();
    fireEvent.change(startDateInput, { target: { value: "01/02/2099" } });

    expect(screen.getByRole("status")).toHaveClass("invalid");
    expect(screen.getByText(/must be .* or later/i)).toHaveClass("field-error");
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
    fireEvent.change(screen.getByLabelText("Price option *"), { target: { value: price.id } });
    fireEvent.change(screen.getByLabelText("Order reference"), {
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
