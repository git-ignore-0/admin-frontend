import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { useAddressFields } from "@/components/address-fields";
import { StoreOrderBuyerFields, useStoreOrderBuyer } from "@/components/store-order-create-buyer";
import { blankStoreOrderDraft } from "@/lib/store-order-draft";
import { selectOption } from "./select-option";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const primary = "58cbea40-4749-4400-9fa3-188de573abaf";
const secondary = "7af0659a-3d22-4d48-8dbd-c947800e0e11";
const phone = "+84912345678";
const timestamp = "2026-07-20T00:00:00Z";

function user(id: string, name: string) {
  return {
    id,
    name,
    email: null,
    login_phone_number: phone,
    email_verified: false,
    phone: "",
    province_code: "",
    ward_code: "",
    address: "",
    has_csa_customer: false,
    points_balance: 0,
    date_joined: timestamp,
    status: "active",
  };
}

function detail(id: string, name: string, phoneNumber = phone) {
  return {
    ...user(id, name),
    invited_users: [],
    invited_count: 0,
    referral_code: "code",
    referrer: null,
    source: "organic",
    shipping_address: {
      id: "1cc92eb5-071c-4d02-82ed-faf8d40d754c",
      recipient_name: name,
      phone_number: phoneNumber,
      province_code: "01",
      ward_code: "00004",
      address: `${name} Street`,
      is_supported: true,
      shipping_fee_vnd: "12000",
      created_at: timestamp,
      updated_at: timestamp,
    },
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AdminI18nProvider initialLocale="en">
      <AdminQueryProvider>{children}</AdminQueryProvider>
    </AdminI18nProvider>
  );
}

function BuyerHarness({
  type = "user",
  kind = "new",
  errors,
}: {
  type?: "user" | "guest";
  kind?: "new" | "historical";
  errors?: { user?: string };
}) {
  const [buyerType, onBuyerTypeChange] = useState(type);
  const [userId, onUserChange] = useState<string | null>(null);
  const [{ guest, guestPhoneEntry }, setDraft] = useState(() => blankStoreOrderDraft());
  const lookup = useStoreOrderBuyer(userId);
  const guestAddress = useAddressFields(guest, buyerType === "guest");
  return (
    <StoreOrderBuyerFields
      kind={kind}
      buyerType={buyerType}
      onBuyerTypeChange={onBuyerTypeChange}
      userId={userId}
      onUserChange={onUserChange}
      guest={guest}
      guestAddress={guestAddress}
      onGuestChange={(change) =>
        setDraft((draft) => ({ ...draft, guest: { ...draft.guest, ...change } }))
      }
      guestPhoneEntry={guestPhoneEntry}
      onGuestPhoneChange={({ value, entry }) =>
        setDraft((draft) => ({
          ...draft,
          guest: { ...draft.guest, phone_number: value },
          guestPhoneEntry: entry,
        }))
      }
      lookup={lookup}
      errors={errors}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("searches on the server, fetches only the chosen user and renders their read-only address", async () => {
  const fetcher = vi.fn(async (path: string) => {
    if (path.includes("/users?")) {
      const conditions = new URL(path, "https://admin.test").searchParams;
      expect(conditions.get("search")).toBe("Taylor");
      return Response.json({
        data: [user(primary, "Taylor One"), user(secondary, "Taylor Two")],
        meta: { page: 1, page_size: 30, total: 2 },
      });
    }
    if (path.includes(primary))
      return Response.json({ data: detail(primary, "Taylor One", "+842412345678") });
    if (path.includes(secondary)) return Response.json({ data: detail(secondary, "Taylor Two") });
    return Response.json({ data: [] });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<BuyerHarness />, { wrapper });
  expect(fetcher).not.toHaveBeenCalled();

  const input = screen.getByRole("combobox", { name: "Search users" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Taylor" } });
  await screen.findByRole("option", { name: /Taylor One/ });
  fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

  const change = screen.getByRole("button", { name: "Change user" });
  expect(change).toHaveFocus();
  const selected = screen.getByRole("group", { name: "Selected user" });
  expect(await within(selected).findByText("Taylor One")).toBeVisible();
  const address = screen.getByRole("region", { name: "Delivery address" });
  expect(within(address).getByText("Taylor One Street")).toBeVisible();
  expect(within(address).getByText("Recipient name").tagName).toBe("DT");
  expect(within(address).getByText("02412345678")).toBeVisible();
  expect(change).not.toHaveAttribute("aria-invalid", "true");
  expect(within(address).queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Province/City" })).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Search users" })).not.toBeInTheDocument();
  expect(fetcher.mock.calls.some(([path]) => path.includes(secondary))).toBe(false);
  expect(fetcher.mock.calls.some(([path]) => path.includes("shipping-areas"))).toBe(false);

  fireEvent.click(change);
  const replacement = screen.getByRole("combobox", { name: "Search users" });
  expect(replacement).toHaveFocus();
  expect(replacement).toHaveValue("");
  expect(screen.queryByRole("region", { name: "Delivery address" })).not.toBeInTheDocument();
  fireEvent.change(replacement, { target: { value: "Taylor" } });
  fireEvent.click(await screen.findByRole("option", { name: /Taylor Two/ }));
  expect(
    await within(screen.getByRole("group", { name: "Selected user" })).findByText("Taylor Two"),
  ).toBeVisible();
  expect(screen.queryByText("Taylor One Street")).not.toBeInTheDocument();
});

it("keeps unsubmitted user search text through blur without selecting an account", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      data: [user(primary, "Taylor One")],
      meta: { page: 1, page_size: 30, total: 1 },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<BuyerHarness />, { wrapper });

  const input = screen.getByRole("combobox", { name: "Search users" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Taylor" } });
  await screen.findByRole("option", { name: /Taylor One/ });
  fireEvent.blur(input);

  expect(input).toHaveValue("Taylor");
  expect(screen.queryByRole("button", { name: "Change user" })).not.toBeInTheDocument();
  expect(fetcher.mock.calls).toHaveLength(1);
});

it("closes a paginated account search with Escape and restores input focus", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        data: [user(primary, "Taylor One")],
        meta: { page: 1, page_size: 1, total: 2 },
      }),
    ),
  );
  render(<BuyerHarness />, { wrapper });
  const input = screen.getByRole("combobox", { name: "Search users" });
  act(() => input.focus());
  fireEvent.change(input, { target: { value: "Taylor" } });
  const next = await screen.findByRole("button", { name: "Next" });
  act(() => next.focus());
  fireEvent.keyDown(next, { key: "Escape", code: "Escape" });
  expect(input).toHaveFocus();
  expect(input).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("option")).not.toBeInTheDocument();
});

it("associates a selected-user error with the Change user button", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      path.includes("/users?")
        ? Response.json({
            data: [user(primary, "Taylor")],
            meta: { page: 1, page_size: 20, total: 1 },
          })
        : Response.json({ data: detail(primary, "Taylor") }),
    ),
  );
  const view = render(<BuyerHarness />, { wrapper });
  const search = screen.getByRole("combobox", { name: "Search users" });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: "Taylor" } });
  fireEvent.click(await screen.findByRole("option", { name: /Taylor/ }));
  const change = screen.getByRole("button", { name: "Change user" });
  view.rerender(<BuyerHarness errors={{ user: "This user is no longer eligible." }} />);
  expect(screen.getByRole("alert")).toHaveTextContent("This user is no longer eligible.");
  expect(change).toHaveAccessibleDescription("This user is no longer eligible.");
  expect(change).toHaveAttribute("aria-invalid", "true");
});

it("associates a locally ineligible account with the Change user control", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      path.includes("/users?")
        ? Response.json({
            data: [user(primary, "Taylor")],
            meta: { page: 1, page_size: 20, total: 1 },
          })
        : Response.json({ data: { ...detail(primary, "Taylor"), status: "suspended" } }),
    ),
  );
  render(<BuyerHarness />, { wrapper });
  const search = screen.getByRole("combobox", { name: "Search users" });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: "Taylor" } });
  fireEvent.click(await screen.findByRole("option", { name: /Taylor/ }));
  const change = screen.getByRole("button", { name: "Change user" });
  await waitFor(() => expect(change).toHaveAttribute("aria-invalid", "true"));
  expect(change).toHaveAccessibleDescription("This account is ineligible to place orders.");
});

it("hides a previous choice immediately and ignores a late user detail response", async () => {
  let finishPrimary!: (response: Response) => void;
  let oldSignal: AbortSignal | null | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path.includes(primary)) {
        oldSignal = options?.signal;
        return new Promise<Response>((resolve) => (finishPrimary = resolve));
      }
      return Response.json({ data: detail(secondary, "Current", "—") });
    }),
  );
  const { result, rerender } = renderHook(({ id }) => useStoreOrderBuyer(id), {
    wrapper,
    initialProps: { id: primary },
  });
  await waitFor(() => expect(oldSignal).toBeDefined());
  rerender({ id: secondary });
  expect(result.current.address).toBeNull();
  await waitFor(() => expect(result.current.address?.recipient_name).toBe("Current"));
  expect(result.current.eligible).toBe(false);
  expect(result.current.issue).toBe("phone_invalid");
  await act(async () => finishPrimary(Response.json({ data: detail(primary, "Old") })));
  expect(oldSignal?.aborted).toBe(true);
  expect(result.current.address?.recipient_name).toBe("Current");
});

it.each(["new", "historical"] as const)(
  "uses supported areas for %s guest orders and preserves other fields when the province changes",
  async (kind) => {
    const fetcher = vi.fn<(path: string, init: RequestInit) => Promise<Response>>(async () =>
      Response.json({
        data: [
          {
            province_code: "01",
            province_name: "First City",
            wards: [{ ward_code: "00004", ward_name: "First Ward", shipping_fee_vnd: "0" }],
          },
          {
            province_code: "02",
            province_name: "Second City",
            wards: [{ ward_code: "00005", ward_name: "Second Ward", shipping_fee_vnd: "0" }],
          },
          { province_code: "03", province_name: "City without supported wards", wards: [] },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const view = render(<BuyerHarness type="guest" kind={kind} />, { wrapper });
    expect(fetcher.mock.calls).toEqual([
      ["/api/backend/public/shipping-areas?locale=en", expect.anything()],
    ]);
    const province = screen.getByRole("combobox", { name: "Province/City" });
    const ward = screen.getByRole("combobox", { name: "Ward/Commune" });
    const recipient = screen.getByRole("textbox", { name: "Recipient name" });
    const phoneInput = screen.getByRole("textbox", { name: "Phone number" });
    const address = screen.getByRole("textbox", { name: "Detailed address" });
    fireEvent.change(recipient, { target: { value: "Taylor" } });
    fireEvent.change(phoneInput, { target: { value: "0912345678" } });
    fireEvent.change(address, { target: { value: "12 Main Street" } });
    await waitFor(() => expect(province).toBeEnabled());
    expect(province).toHaveAttribute("readonly");
    expect(ward).toHaveAttribute("readonly");
    expect(ward).toBeDisabled();
    selectOption(province, "01");
    selectOption(ward, "00004");
    expect(ward).toHaveValue("First Ward");
    fireEvent.click(province);
    expect(screen.queryByRole("option", { name: "City without supported wards" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "Second City" }));
    expect(ward).toHaveValue("");
    expect(recipient).toHaveValue("Taylor");
    expect(phoneInput).toHaveValue("0912345678");
    expect(address).toHaveValue("12 Main Street");
    view.rerender(<BuyerHarness type="guest" kind={kind === "new" ? "historical" : "new"} />);
    expect(province).toHaveValue("Second City");
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it("labels guest address controls and applies the shared mobile phone format", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: [] })),
  );
  render(<BuyerHarness type="guest" />, { wrapper });
  const input = screen.getByRole("textbox", { name: "Phone number" });
  expect(input).toHaveAttribute("type", "tel");
  expect(input).toHaveAttribute("inputmode", "numeric");
  expect(input).toHaveAttribute("autocomplete", "shipping tel-national");
  expect(input).toHaveAttribute("placeholder", "0912345678");
  expect(input).toBeRequired();
  expect(input).toHaveValue("");
  expect(input).not.toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("textbox", { name: "Detailed address" })).toHaveAttribute(
    "autocomplete",
    "shipping address-line1",
  );
  expect(await screen.findByText("There are no supported shipping areas.")).toBeVisible();

  fireEvent.change(input, { target: { value: "0612345678" } });
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("Invalid phone number");
  fireEvent.change(input, { target: { value: "0912345678" } });
  expect(input).not.toHaveAttribute("aria-invalid", "true");
});

it("pastes formatted guest phones as digits and replaces only the selection", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: [] })),
  );
  render(<BuyerHarness type="guest" />, { wrapper });
  expect(await screen.findByText("There are no supported shipping areas.")).toBeVisible();
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Phone number" });
  fireEvent.paste(input, { clipboardData: { getData: () => "(090) 123-4567" } });
  expect(input).toHaveValue("0901234567");
  input.setSelectionRange(2, 4);
  fireEvent.paste(input, { clipboardData: { getData: () => "3abc\n4９" } });
  expect(input).toHaveValue("0934234567");
  expect(input).toBeValid();
});

it("reports an overlong paste until the guest explicitly reenters a valid phone", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: [] })),
  );
  render(<BuyerHarness type="guest" />, { wrapper });
  expect(await screen.findByText("There are no supported shipping areas.")).toBeVisible();
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Phone number" });
  fireEvent.input(input, { target: { value: "0912345678" } });
  input.select();
  fireEvent.paste(input, { clipboardData: { getData: () => "+84 912 345 678" } });
  expect(input).toHaveValue("0912345678");
  expect(input).toHaveAccessibleDescription("Invalid phone number");
  expect(screen.queryByRole("button", { name: "Use the current number" })).not.toBeInTheDocument();
  input.select();
  fireEvent.paste(input, { clipboardData: { getData: () => "0912 345 678" } });
  expect(input).toHaveValue("0912345678");
  expect(input).toBeValid();
});

it("blocks a retained guest phone after an invalid typed or autofilled replacement", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: [] })),
  );
  render(<BuyerHarness type="guest" />, { wrapper });
  expect(await screen.findByText("There are no supported shipping areas.")).toBeVisible();
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Phone number" });
  fireEvent.input(input, { target: { value: "0912345678" } });
  fireEvent.input(input, { target: { value: "0902 345 6789" } });
  expect(input).toHaveValue("0912345678");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("Invalid phone number");
  fireEvent.input(input, { target: { value: "0902345678" } });
  expect(input).not.toHaveAttribute("aria-invalid", "true");
});
