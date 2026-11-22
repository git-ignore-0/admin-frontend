import { focusManager, onlineManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { AdminShell } from "@/components/admin-shell";
import { LinkCustomerUserDialog } from "@/components/link-customer-user-dialog";
import { ToastProvider } from "@/components/toast-provider";
import { UserDetail } from "@/components/user-detail";
import { UserDirectory } from "@/components/user-directory";
import { adminDictionaries } from "@/lib/admin-i18n";
import { ADMIN_SESSION_CHANGED_EVENT } from "@/lib/client-api";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));
const { push } = router;
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const userId = "58cbea40-4749-4400-9fa3-188de573abaf";
const otherUserId = "04d465b7-8245-4123-b1a5-4cf28e13e4d5";
const listMeta = { page: 1, page_size: 30, total: 1 };
const user = {
  id: userId,
  name: "Garden Member",
  email: null,
  login_phone_number: "+84912345678",
  email_verified: false,
  phone: "0987654321",
  date_joined: "2026-07-20T02:00:00Z",
  status: "pending_activation",
  points_balance: 50,
  has_csa_customer: false,
  referral_code: "NFV1234567",
  source: "organic",
  referrer: null,
  invited_count: 1,
  invited_users: [
    { id: "invitee", name: "Invited Member", email: null, status: "pending_activation" },
  ],
};
const otherUser = { ...user, id: otherUserId, name: "Orchard Member" };
const referralUser = { ...user, email: "member@example.com", address: "12 Private Lane" };
const password = "  Strong-Harvest-42!  ";
const originalMatchMedia = window.matchMedia;

function scene(children: React.ReactNode, initialLocale: "en" | "vi" = "en") {
  return (
    <RouterContext.Provider value={router as unknown as NextRouter}>
      <AdminI18nProvider initialLocale={initialLocale}>
        <ToastProvider>
          <AdminQueryProvider>{children}</AdminQueryProvider>
        </ToastProvider>
      </AdminI18nProvider>
    </RouterContext.Provider>
  );
}

function show(children: React.ReactNode, initialLocale: "en" | "vi" = "en") {
  return render(scene(children, initialLocale));
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function referralPage(page: 1 | 2) {
  const invited = {
    ...user.invited_users[0],
    id: page === 2 ? "invitee-two" : "invitee",
    name: page === 2 ? "Second Invited Member" : "Invited Member",
  };
  return Response.json({
    data: { ...referralUser, invited_count: 31, invited_users: [invited] },
    meta: { invited: { page, page_size: 30, total: 31 } },
  });
}

async function openCreateAccount(label = "Create account") {
  const button = screen.getByRole("button", { name: label });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  return screen.getByRole("dialog", { name: label });
}

function passwords(dialog: HTMLElement, first = password, second = password, locale = "en") {
  const inputs = within(dialog);
  const password1 = inputs.getByLabelText(locale === "vi" ? "Mật khẩu mới" : "New password");
  const password2 = inputs.getByLabelText(
    locale === "vi" ? "Nhập lại mật khẩu" : "Confirm password",
  );
  expect(password1).toHaveAttribute("type", "password");
  expect(password2).toHaveAttribute("type", "password");
  fireEvent.change(password1, { target: { value: first } });
  fireEvent.change(password2, { target: { value: second } });
  return { password1, password2 };
}

function setMobileViewport() {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const result = originalMatchMedia(query);
    return query === "(max-width: 47.99em)" ? { ...result, matches: true } : result;
  });
}

beforeEach(() => {
  window.history.replaceState(null, "", "/users");
  router.prefetch.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  delete document.documentElement.dataset.adminPageSession;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("CMS account administration", () => {
  const invalidResponseMessage = adminDictionaries.en.common.invalidResponse;

  it.each([{}, { id: "invalid-id", status: "pending_activation" }])(
    "keeps an invalid create response in the dialog without navigating (%j)",
    async (data) => {
      const fetcher = vi.fn(async (_path: string, init?: RequestInit) =>
        init?.method === "POST"
          ? Response.json({ data }, { status: 201 })
          : Response.json({ data: [], meta: { ...listMeta, total: 0 } }),
      );
      vi.stubGlobal("fetch", fetcher);
      show(<UserDirectory />);
      const dialog = await openCreateAccount();
      fireEvent.change(within(dialog).getByLabelText(/^Full name/i), {
        target: { value: user.name },
      });
      fireEvent.change(within(dialog).getByLabelText(/^Login phone/i), {
        target: { value: "0912345678" },
      });
      const { password1, password2 } = passwords(dialog);
      fireEvent.click(within(dialog).getByRole("button", { name: "Create account" }));
      expect(await within(dialog).findByText(invalidResponseMessage)).toBeVisible();
      expect(password1).toHaveValue(password);
      expect(password2).toHaveValue(password);
      expect(screen.queryByText(adminDictionaries.en.users.accountActions.created)).toBeNull();
      expect(push).not.toHaveBeenCalled();
      expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    },
  );

  it.each([
    ["Suspend", "active", { id: userId, status: "active" }],
    ["Reset password", "active", { id: otherUserId, status: "active" }],
    ["Activate", "pending_activation", {}],
    ["Reactivate", "suspended", { id: userId }],
  ])("keeps the loaded account state on a malformed %s response", async (action, status, data) => {
    const fetcher = vi.fn(async (_path: string, init?: RequestInit) =>
      Response.json({ data: init?.method === "POST" ? data : { ...user, status } }),
    );
    vi.stubGlobal("fetch", fetcher);
    show(<UserDetail userId={userId} />);
    fireEvent.click(await screen.findByRole("button", { name: action }));
    const dialog = screen.queryByRole("dialog");
    const inputs = dialog && action === "Reset password" ? passwords(dialog) : null;
    if (dialog) fireEvent.click(within(dialog).getByRole("button", { name: action }));
    expect(await screen.findByText(invalidResponseMessage)).toBeVisible();
    if (dialog) expect(dialog).toBeVisible();
    if (inputs) expect(inputs.password1).toHaveValue(password);
    const copy = adminDictionaries.en.users.accountActions;
    expect(screen.queryByText(copy.success)).toBeNull();
    expect(screen.queryByText(copy.resetSuccess)).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual(["GET", "POST"]);
  });

  it.each([null, {}, { ...user, name: {} }, { ...user, has_csa_customer: "false" }])(
    "rejects a malformed Users refresh before replacing the last valid rows (%j)",
    async (row) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(Response.json({ data: [user], meta: listMeta }))
          .mockResolvedValueOnce(Response.json({ data: [row], meta: { ...listMeta, total: 42 } })),
      );
      show(<UserDirectory />);
      expect(await screen.findByRole("link", { name: /Garden Member/ })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Refresh users" }));
      expect(await screen.findByText(invalidResponseMessage)).toBeVisible();
      expect(screen.getByRole("link", { name: /Garden Member/ })).toBeVisible();
      expect(screen.queryByText("42 results")).toBeNull();
    },
  );

  it("rejects a malformed Users result before offering it for CSA linking", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ data: [{}], meta: listMeta })),
    );
    show(
      <LinkCustomerUserDialog
        customerId="customer"
        fallbackFocusRef={{ current: null }}
        onCancel={vi.fn()}
        onLinked={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "account" } });
    fireEvent.submit(screen.getByRole("form", { name: /find account/i }));
    expect(await screen.findByText(invalidResponseMessage)).toBeVisible();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("button", { name: "Confirm link" })).toBeDisabled();
  });

  it("shows Chờ kích hoạt in Users and keeps both phone fields in the account detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) =>
        path.includes("?invited_page=")
          ? Response.json({ data: user, meta: { invited: listMeta } })
          : Response.json({ data: [user], meta: listMeta }),
      ),
    );
    const directory = show(<UserDirectory />, "vi");
    const row = await screen.findByRole("row", { name: /Garden Member/ });
    expect(within(row).getByText("Chờ kích hoạt")).toBeVisible();
    expect(within(row).getByText("Chưa có email")).toBeVisible();
    expect(within(row).queryByText(user.login_phone_number)).toBeNull();
    expect(within(row).queryByText(user.phone)).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "SĐT đăng nhập" })).toBeNull();

    directory.rerender(scene(<UserDetail userId={userId} />, "vi"));
    expect(await screen.findByText(user.login_phone_number)).toBeVisible();
    expect(screen.getByText(user.phone)).toBeVisible();
    expect(screen.getByText("SĐT đăng nhập")).toBeVisible();
  });

  it.each([
    [
      "vi",
      "Tạo tài khoản",
      "Mật khẩu mới",
      "Tối thiểu 12 ký tự. Không dùng mật khẩu phổ biến, chỉ gồm chữ số hoặc quá giống thông tin tài khoản.",
    ],
    [
      "en",
      "Create account",
      "New password",
      "Use at least 12 characters. Avoid common passwords, passwords made only of numbers, and passwords too similar to account information.",
    ],
  ] as const)(
    "describes the password policy below the create password field in %s",
    async (locale, label, field, policy) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ data: [], meta: listMeta })),
      );
      show(<UserDirectory />, locale);
      const dialog = within(await openCreateAccount(label));
      const input = dialog.getByLabelText(field);
      const description = dialog.getByText(policy);
      expect(input).toHaveAccessibleDescription(policy);
      expect(
        input.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );

  it("creates a phone-only account and opens its detail with the password preserved in the POST", async () => {
    let resolveCreate!: (response: Response) => void;
    const create = new Promise<Response>((resolve) => {
      resolveCreate = resolve;
    });
    let created = false;
    const fetcher = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === "POST"
        ? create
        : Response.json({
            data: created ? [user] : [],
            meta: { ...listMeta, page: 2, total: 31 },
          }),
    );
    vi.stubGlobal("fetch", fetcher);
    window.history.replaceState(null, "", "/users?page=2&search=garden&status=pending_activation");
    show(<UserDirectory />);
    const dialog = await openCreateAccount();
    fireEvent.change(within(dialog).getByLabelText(/^Full name/i), {
      target: { value: user.name },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Login phone/i), {
      target: { value: "0912345678" },
    });
    passwords(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Create account" }));
    expect(within(dialog).getByRole("button", { name: /saving/i })).toBeDisabled();
    fireEvent.submit(dialog.querySelector("form")!);
    expect(fetcher.mock.calls.filter(([, request]) => request?.method === "POST")).toHaveLength(1);
    created = true;
    resolveCreate(
      Response.json({ data: { id: userId, status: "pending_activation" } }, { status: 201 }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledOnce());
    const destination = new URL(String(push.mock.calls[0][0]), window.location.origin);
    expect(destination.pathname).toBe(`/users/${userId}`);
    expect(Object.fromEntries(destination.searchParams)).toEqual({
      page: "2",
      search: "garden",
      status: "pending_activation",
    });
    expect(await screen.findByRole("link", { name: /Garden Member/ })).toBeVisible();
    expect(
      fetcher.mock.calls.filter(([, request]) => request?.method !== "POST").map(([path]) => path),
    ).toEqual([
      "/api/backend/admin/users?page=2&search=garden&status=pending_activation",
      "/api/backend/admin/users?page=2&search=garden&status=pending_activation",
    ]);
    const [path, init] = fetcher.mock.calls.find(([, request]) => request?.method === "POST")!;
    expect(path).toBe("/api/backend/admin/users");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: user.name,
      login_phone_number: "0912345678",
      password1: password,
      password2: password,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the current page when account creation completes after leaving Users", async () => {
    const create = deferredResponse();
    const fetcher = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === "POST" ? create.promise : Response.json({ data: [], meta: listMeta }),
    );
    vi.stubGlobal("fetch", fetcher);
    const view = show(<UserDirectory />);
    const dialog = await openCreateAccount();
    fireEvent.change(within(dialog).getByLabelText("Full name"), { target: { value: user.name } });
    fireEvent.change(within(dialog).getByLabelText("Login phone"), {
      target: { value: "0912345678" },
    });
    passwords(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Create account" }));

    view.rerender(scene(<p>Another screen</p>));
    await act(async () => {
      create.resolve(Response.json({ data: { id: userId, status: user.status } }, { status: 201 }));
    });

    expect(screen.getByText("Another screen")).toBeVisible();
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it.each([
    {
      locale: "vi",
      create: "Tạo tài khoản",
      name: "Họ và tên",
      phone: "SĐT đăng nhập",
      phoneError: "Số điện thoại đăng nhập này đã được sử dụng.",
      emailError: "Email này đã được sử dụng.",
    },
    {
      locale: "en",
      create: "Create account",
      name: "Full name",
      phone: "Login phone",
      phoneError: "This login phone number is already in use.",
      emailError: "This email is already in use.",
    },
  ] as const)("shows duplicate identifiers beside their create fields in $locale", async (copy) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) =>
        init?.method === "POST"
          ? Response.json(
              {
                login_phone_number: ["This identifier is already in use."],
                email: ["This identifier is already in use."],
              },
              { status: 400 },
            )
          : Response.json({ data: [], meta: listMeta }),
      ),
    );
    show(<UserDirectory />, copy.locale);
    const dialog = await openCreateAccount(copy.create);
    fireEvent.change(within(dialog).getByLabelText(copy.name), {
      target: { value: user.name },
    });
    const phone = within(dialog).getByLabelText(copy.phone);
    const email = within(dialog).getByLabelText(/^Email/i);
    fireEvent.change(phone, { target: { value: "0912345678" } });
    fireEvent.change(email, { target: { value: "member@example.com" } });
    const { password1 } = passwords(dialog, password, password, copy.locale);
    fireEvent.click(within(dialog).getByRole("button", { name: copy.create }));
    await within(dialog).findByText(copy.phoneError);
    expect(phone).toHaveAccessibleDescription(copy.phoneError);
    expect(email).toHaveAccessibleDescription(copy.emailError);
    expect(phone).toHaveValue("0912345678");
    expect(email).toHaveValue("member@example.com");
    expect(password1).toHaveValue(password);
    expect(push).not.toHaveBeenCalled();
  });

  it("synchronizes Users and detail after activating, confirming suspension, and reactivating", async () => {
    let status = user.status;
    const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        status = path.endsWith("/suspend") ? "suspended" : "active";
        return Response.json({ data: { id: userId, status } });
      }
      if (path.startsWith("/api/backend/admin/users?")) {
        return Response.json({ data: [{ ...user, status }], meta: listMeta });
      }
      return Response.json({
        data: { ...user, status },
        meta: { invited: listMeta },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    show(
      <>
        <UserDirectory />
        <UserDetail userId={userId} />
      </>,
    );
    const list = await screen.findByRole("table", { name: "Users" });
    for (const [action, urlAction, nextStatus] of [
      ["Activate", "activate", "Active"],
      ["Suspend", "suspend", "Suspended"],
      ["Reactivate", "reactivate", "Active"],
    ]) {
      const path = `/api/backend/admin/users/${userId}/${urlAction}`;
      expect(fetcher.mock.calls.some(([url]) => url === path)).toBe(false);
      fireEvent.click(await screen.findByRole("button", { name: action }));
      if (urlAction === "suspend") {
        expect(fetcher.mock.calls.some(([url]) => url === path)).toBe(false);
        const dialog = screen.getByRole("dialog", { name: action });
        fireEvent.click(within(dialog).getByRole("button", { name: action }));
      }
      expect(await within(list).findByText(nextStatus)).toBeVisible();
      await waitFor(() => expect(screen.getAllByText(nextStatus)).toHaveLength(2));
      expect(fetcher).toHaveBeenCalledWith(
        path,
        expect.objectContaining({ method: "POST", body: "{}" }),
      );
      expect(screen.getByText("NFV1234567")).toBeVisible();
      expect(screen.getByText("Invited Member")).toBeVisible();
      expect(screen.getByText("50")).toBeVisible();
    }
    expect(fetcher.mock.calls.filter(([path]) => path.includes("?invited_page="))).toHaveLength(4);
    expect(
      fetcher.mock.calls.filter(([path]) => path.startsWith("/api/backend/admin/users?")),
    ).toHaveLength(4);
  });

  it.each([
    ["leaving User detail", null, 200],
    ["switching to another user", otherUserId, 200],
    ["switching users before a conflict response", otherUserId, 409],
  ] as const)("ignores a late activation response after %s", async (_scenario, nextId, status) => {
    const activation = deferredResponse();
    const nextPath = `/api/backend/admin/users/${otherUserId}?invited_page=1`;
    const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") return activation.promise;
      return Response.json({ data: path === nextPath ? otherUser : user });
    });
    vi.stubGlobal("fetch", fetcher);
    const view = show(<UserDetail userId={userId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));
    expect(fetcher).toHaveBeenCalledWith(
      `/api/backend/admin/users/${userId}/activate`,
      expect.objectContaining({ method: "POST" }),
    );

    view.rerender(scene(nextId ? <UserDetail userId={nextId} /> : <p>Another screen</p>));
    if (nextId) {
      await screen.findByText(/^Orchard Member/);
      expect(screen.getByRole("button", { name: "Activate" })).toBeEnabled();
    }
    await act(async () => {
      activation.resolve(
        status === 409
          ? Response.json({ errors: [{ code: "account_state_conflict" }] }, { status })
          : Response.json({ data: { id: userId, status: "active" } }),
      );
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    if (nextId) expect(screen.getByRole("button", { name: "Activate" })).toBeEnabled();
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      `/api/backend/admin/users/${userId}?invited_page=1`,
      `/api/backend/admin/users/${userId}/activate`,
      ...(nextId ? [nextPath] : []),
    ]);
  });

  it.each([
    ["current", false],
    ["abandoned", true],
  ] as const)("handles session expiry on the %s activation screen", async (_scenario, leave) => {
    const activation = deferredResponse();
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: `/users/${userId}`, assign });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) =>
        init?.method === "POST" ? activation.promise : Response.json({ data: user }),
      ),
    );
    const view = show(<UserDetail userId={userId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));
    if (leave) view.rerender(scene(<p>Another screen</p>));

    await act(async () => activation.resolve(Response.json({}, { status: 401 })));

    if (leave) expect(assign).not.toHaveBeenCalled();
    else expect(assign).toHaveBeenCalledWith(`/login?returnTo=%2Fusers%2F${userId}`);
  });

  it("keeps the new user's dialog active when a previous user's reset completes", async () => {
    const reset = deferredResponse();
    const nextPath = `/api/backend/admin/users/${otherUserId}?invited_page=1`;
    const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") return reset.promise;
      return Response.json({ data: path === nextPath ? otherUser : user });
    });
    vi.stubGlobal("fetch", fetcher);
    const view = show(<UserDetail userId={userId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reset password" }));
    const originalDialog = screen.getByRole("dialog", { name: "Reset password" });
    passwords(originalDialog);
    fireEvent.click(within(originalDialog).getByRole("button", { name: "Reset password" }));

    view.rerender(scene(<UserDetail userId={otherUserId} />));
    await screen.findByText(/^Orchard Member/);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    const currentDialog = screen.getByRole("dialog", { name: "Reset password" });
    await act(async () => {
      reset.resolve(Response.json({ data: { id: userId, status: user.status } }));
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(currentDialog).toBeVisible();
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      `/api/backend/admin/users/${userId}?invited_page=1`,
      `/api/backend/admin/users/${userId}/reset-password`,
      nextPath,
    ]);
  });

  it.each(["pending_activation", "active", "suspended"])(
    "resets a %s account without verified email and clears password inputs on success",
    async (status) => {
      const fetcher = vi.fn(async (_path: string, init?: RequestInit) =>
        init?.method === "POST"
          ? Response.json({ data: { id: userId, status } })
          : Response.json({ data: { ...user, status, email: "unverified@example.com" } }),
      );
      vi.stubGlobal("fetch", fetcher);
      show(<UserDetail userId={userId} />);
      fireEvent.click(await screen.findByRole("button", { name: "Reset password" }));
      expect(screen.getByText("Unverified")).toBeVisible();
      const dialog = screen.getByRole("dialog", { name: "Reset password" });
      expect(within(dialog).getByText(/ends existing sessions/i)).toBeVisible();
      passwords(dialog);
      fireEvent.click(within(dialog).getByRole("button", { name: "Reset password" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(fetcher).toHaveBeenCalledWith(
        `/api/backend/admin/users/${userId}/reset-password`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ password1: password, password2: password }),
        }),
      );
      expect(screen.getByText("NFV1234567")).toBeVisible();
      const resetButton = screen.getByRole("button", { name: "Reset password" });
      await waitFor(() => expect(resetButton).toBeEnabled());
      fireEvent.click(resetButton);
      expect(within(screen.getByRole("dialog")).getByLabelText(/^New password/i)).toHaveValue("");
    },
  );

  it("directs a verified account to email recovery and omits the CMS reset action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: { ...user, status: "active", email: "member@example.com", email_verified: true },
        }),
      ),
    );
    show(<UserDetail userId={userId} />);
    expect(await screen.findByText(/forgot password with their verified email/i)).toBeVisible();
    expect(screen.getByText("Verified")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reset password" })).toBeNull();
  });

  it.each([
    ["deletion_requested", "Deletion requested"],
    ["anonymized", "Anonymized"],
  ])("shows %s details without account mutations", async (status, label) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: { ...user, status } })),
    );
    show(<UserDetail userId={userId} />);
    expect(await screen.findByText(label)).toBeVisible();
    expect(screen.getByText("NFV1234567")).toBeVisible();
    expect(screen.queryByRole("button", { name: /activate|suspend|reset password/i })).toBeNull();
  });

  it.each(["desktop", "mobile"] as const)(
    "keeps the %s account projection stable while only the requested referral page loads",
    async (viewport) => {
      if (viewport === "mobile") setMobileViewport();
      const nextPage = deferredResponse();
      const fetcher = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(
        async (path) => (path.endsWith("invited_page=2") ? nextPage.promise : referralPage(1)),
      );
      vi.stubGlobal("fetch", fetcher);
      show(<UserDetail userId={userId} intercepted />);
      expect(await screen.findByText("Invited Member")).toBeVisible();
      const heading = screen.getByRole("heading", { name: user.name });
      const activate = screen.getByRole("button", { name: "Activate" });
      fireEvent.click(screen.getByRole("button", { name: "Next" }));

      const referrals = await screen.findByRole("region", { name: "People invited (31)" });
      expect(within(referrals).getByRole("status")).toHaveTextContent("Loading invited users");
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(screen.queryByText("Loading users…")).toBeNull();
      expect(screen.queryByText("Invited Member")).toBeNull();
      expect(heading).toBeVisible();
      expect(screen.getByText(referralUser.email)).toBeVisible();
      expect(screen.getByText(referralUser.address)).toBeVisible();
      expect(screen.getByText(user.login_phone_number)).toBeVisible();
      expect(screen.getByText("50")).toBeVisible();
      expect(screen.getByText("NFV1234567")).toBeVisible();
      expect(screen.getByRole("navigation", { name: "Page 2/2" })).toHaveAttribute(
        "aria-busy",
        "true",
      );
      expect(activate).toBeDisabled();
      fireEvent.click(activate);
      expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

      await act(async () => nextPage.resolve(referralPage(2)));
      expect(await within(referrals).findByText("Second Invited Member")).toBeVisible();
      expect(within(referrals).queryByRole("status")).toBeNull();
      expect(screen.queryByText("Invited Member")).toBeNull();
      expect(heading).toBeVisible();
      expect(activate).toBeEnabled();
      expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
        `/api/backend/admin/users/${userId}?invited_page=1`,
        `/api/backend/admin/users/${userId}?invited_page=2`,
      ]);
    },
  );

  it("retries a failed referral page without losing the account projection", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(referralPage(1))
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(referralPage(2));
    vi.stubGlobal("fetch", fetcher);
    show(<UserDetail userId={userId} intercepted />);
    expect(await screen.findByText("Invited Member")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const referrals = await screen.findByRole("region", { name: "People invited (31)" });
    expect(await within(referrals).findByRole("alert")).toHaveTextContent(
      adminDictionaries.en.common.serverError,
    );
    expect(screen.queryByText("Invited Member")).toBeNull();
    expect(screen.getByRole("heading", { name: user.name })).toBeVisible();
    expect(screen.getByText(referralUser.address)).toBeVisible();
    expect(screen.getByRole("button", { name: "Activate" })).toBeDisabled();
    fireEvent.click(within(referrals).getByRole("button", { name: "Try again" }));
    expect(await within(referrals).findByText("Second Invited Member")).toBeVisible();
    expect(within(referrals).queryByRole("alert")).toBeNull();
    expect(fetcher).toHaveBeenLastCalledWith(
      `/api/backend/admin/users/${userId}?invited_page=2`,
      expect.anything(),
    );
  });

  it("removes all retained detail and referral metadata after a referral-page denial", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(referralPage(1))
      .mockResolvedValueOnce(Response.json({}, { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    show(<UserDetail userId={userId} intercepted />);
    expect(await screen.findByText("Invited Member")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      adminDictionaries.en.common.forbidden,
    );
    expect(screen.queryByRole("heading", { name: user.name })).toBeNull();
    expect(screen.queryByText(referralUser.email)).toBeNull();
    expect(screen.queryByText(referralUser.address)).toBeNull();
    expect(screen.queryByText("50")).toBeNull();
    expect(screen.queryByText("NFV1234567")).toBeNull();
    expect(screen.queryByRole("region", { name: "People invited (31)" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: /Page/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Activate" })).toBeNull();
  });

  it("keeps the account visible and the pending referral page local while offline", async () => {
    const fetcher = vi.fn(async (path: string) =>
      referralPage(path.endsWith("invited_page=2") ? 2 : 1),
    );
    vi.stubGlobal("fetch", fetcher);
    show(<UserDetail userId={userId} />);
    expect(await screen.findByText("Invited Member")).toBeVisible();
    act(() => onlineManager.setOnline(false));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const referrals = screen.getByRole("region", { name: "People invited (31)" });
    expect(await within(referrals).findByRole("alert")).toHaveTextContent(
      adminDictionaries.en.users.offline,
    );
    expect(within(referrals).queryByRole("status")).toBeNull();
    expect(screen.getByRole("heading", { name: user.name })).toBeVisible();
    expect(screen.getByRole("button", { name: "Activate" })).toBeDisabled();
    expect(screen.queryByText("Invited Member")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);

    act(() => onlineManager.setOnline(true));
    expect(await within(referrals).findByText("Second Invited Member")).toBeVisible();
    expect(within(referrals).queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Activate" })).toBeEnabled();
  });

  it("discards the previous user's detail and late invitees when changing users mid-page", async () => {
    const nextPage = deferredResponse();
    const nextAccount = deferredResponse();
    const fetcher = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async (path) => {
      if (path.includes(otherUserId)) return nextAccount.promise;
      if (path.endsWith("invited_page=2")) return nextPage.promise;
      return referralPage(1);
    });
    vi.stubGlobal("fetch", fetcher);
    const view = show(<UserDetail userId={userId} />);
    expect(await screen.findByText("Invited Member")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

    view.rerender(scene(<UserDetail userId={otherUserId} />));
    expect(screen.queryByText(user.name)).toBeNull();
    expect(screen.queryByText(referralUser.address)).toBeNull();
    expect(await screen.findByRole("status")).toHaveTextContent("Loading users…");
    expect(fetcher.mock.calls[1][1]?.signal?.aborted).toBe(true);
    await act(async () => nextPage.resolve(referralPage(2)));
    expect(screen.queryByText("Second Invited Member")).toBeNull();
    await act(async () => nextAccount.resolve(Response.json({ data: otherUser })));
    expect(await screen.findByRole("heading", { name: otherUser.name })).toBeVisible();
    expect(screen.queryByText(user.name)).toBeNull();
    expect(screen.queryByText("Second Invited Member")).toBeNull();
  });

  it("cancels a pending referral page and removes the account summary when the session retires", async () => {
    const nextPage = deferredResponse();
    const fetcher = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async (path) =>
      path.endsWith("invited_page=2") ? nextPage.promise : referralPage(1),
    );
    vi.stubGlobal("fetch", fetcher);
    const sessionBinding = "referral-test-users-session";
    render(
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <AdminShell sessionBinding={sessionBinding} user={{ ...user, name: "Administrator" }}>
            <UserDetail userId={userId} intercepted />
          </AdminShell>
        </ToastProvider>
      </AdminI18nProvider>,
    );
    expect(await screen.findByText("Invited Member")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Loading invited users…")).toBeVisible();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(ADMIN_SESSION_CHANGED_EVENT, { detail: sessionBinding }),
      );
    });
    expect(screen.getByRole("alert")).toHaveTextContent("The admin session changed");
    expect(fetcher.mock.calls[1][1]?.signal?.aborted).toBe(true);
    expect(screen.queryByText(referralUser.address)).toBeNull();
    expect(screen.queryByRole("navigation", { name: /Page/ })).toBeNull();
    await act(async () => nextPage.resolve(referralPage(2)));
    expect(screen.queryByText(user.name)).toBeNull();
    expect(screen.queryByText("Second Invited Member")).toBeNull();
  });

  it("uses one initial detail loading state and keeps the drawer populated during revalidation", async () => {
    const initial = deferredResponse();
    const refresh = deferredResponse();
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(refresh.promise);
    vi.stubGlobal("fetch", fetcher);
    show(<UserDetail userId={userId} intercepted />);
    expect(await screen.findByRole("status")).toHaveTextContent("Loading users…");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    await act(async () => initial.resolve(referralPage(1)));
    const drawer = await screen.findByRole("dialog", { name: user.name });

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(within(drawer).queryByRole("status")).toBeNull();
    expect(within(drawer).getByText(referralUser.address)).toBeVisible();
    expect(within(drawer).getByText("Invited Member")).toBeVisible();
    expect(within(drawer).getByRole("navigation", { name: "Page 1/2" })).toBeVisible();
    await act(async () => refresh.resolve(referralPage(1)));
    expect(drawer).toBeVisible();
  });

  it("uses the desktop drawer preset and restores the reset action after nested Escape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: user })),
    );
    show(<UserDetail userId={userId} intercepted />);
    const drawer = await screen.findByRole("dialog", { name: user.name });
    expect(drawer.closest(".mantine-Drawer-root")).toHaveStyle({
      "--drawer-size": "calc(40rem * var(--mantine-scale))",
    });
    expect(within(drawer).getByRole("heading", { name: user.name })).toBeVisible();
    expect(within(drawer).getByText("NFV1234567")).toBeVisible();
    const reset = within(drawer).getByRole("button", { name: "Reset password" });
    expect(reset.closest("footer")).toBeInTheDocument();
    reset.focus();
    fireEvent.click(reset);

    const confirmation = await screen.findByRole("dialog", { name: "Reset password" });
    expect(drawer).toHaveAttribute("inert");
    await waitFor(() =>
      expect(confirmation).toContainElement(document.activeElement as HTMLElement),
    );
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(confirmation).not.toBeInTheDocument());
    expect(drawer).toBeVisible();
    expect(router.back).not.toHaveBeenCalled();
    await waitFor(() => expect(reset).toHaveFocus());
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    expect(router.back).toHaveBeenCalledOnce();
  });

  it("shows shared account and referral content on the intercepted mobile detail page", async () => {
    setMobileViewport();
    window.history.replaceState(null, "", `/users/${userId}?page=2&search=garden`);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: user })),
    );
    show(<UserDetail userId={userId} intercepted />);

    expect(await screen.findByRole("heading", { name: user.name, level: 1 })).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(user.login_phone_number)).toBeVisible();
    expect(screen.getByText("NFV1234567")).toBeVisible();
    expect(screen.getByRole("button", { name: "Activate" }).closest("footer")).toBeInTheDocument();
    const back = screen.getByRole("link", { name: "Users" });
    expect(back).toHaveAttribute("href", "/users?search=garden&page=2");
    fireEvent.click(back);
    expect(router.back).toHaveBeenCalledOnce();
  });

  it.each(["desktop", "mobile"] as const)(
    "drops protected detail and closes a reset dialog after a %s background read returns 403",
    async (viewport) => {
      if (viewport === "mobile") setMobileViewport();
      const protectedAccount = {
        ...user,
        email: "member@example.com",
        address: "12 Private Lane",
      };
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            data: protectedAccount,
            meta: {
              invited: { ...listMeta, total: 31 },
            },
          }),
        )
        .mockResolvedValueOnce(Response.json({}, { status: 403 }));
      vi.stubGlobal("fetch", fetcher);
      show(<UserDetail userId={userId} intercepted />);
      expect(await screen.findByText(protectedAccount.address)).toBeVisible();
      expect(screen.getByText(protectedAccount.email)).toBeVisible();
      expect(screen.getByText("50")).toBeVisible();
      expect(screen.getByText("Invited Member")).toBeVisible();
      expect(screen.getByRole("navigation", { name: "Page 1/2" })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
      const dialog = await screen.findByRole("dialog", { name: "Reset password" });
      passwords(dialog);
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });

      expect(await screen.findByRole("alert")).toHaveTextContent(/not allowed/i);
      expect(dialog).not.toBeInTheDocument();
      expect(screen.queryByText(protectedAccount.address)).toBeNull();
      expect(screen.queryByText(protectedAccount.email)).toBeNull();
      expect(screen.queryByText(user.login_phone_number)).toBeNull();
      expect(screen.queryByText(user.phone)).toBeNull();
      expect(screen.queryByText("50")).toBeNull();
      expect(screen.queryByText("NFV1234567")).toBeNull();
      expect(screen.queryByText("Invited Member")).toBeNull();
      expect(screen.queryByRole("navigation", { name: "Page 1/2" })).toBeNull();
      expect(screen.queryByRole("button", { name: /activate|suspend|reset password/i })).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );

  it("rechecks read access after a forbidden mutation and removes protected detail on denial", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: user }))
      .mockResolvedValueOnce(Response.json({ detail: "Forbidden" }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ detail: "Forbidden" }, { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    show(<UserDetail userId={userId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reset password" }));
    const dialog = screen.getByRole("dialog", { name: "Reset password" });
    passwords(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset password" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(await screen.findByRole("alert")).toHaveTextContent(/not allowed/i);
    expect(screen.queryByText(user.login_phone_number)).toBeNull();
    expect(screen.queryByText("NFV1234567")).toBeNull();
    expect(fetcher.mock.calls.map(([, init]) => init.method ?? "GET")).toEqual([
      "GET",
      "POST",
      "GET",
    ]);
  });

  it("removes the reset dialog for a retired session and ignores its late mutation result", async () => {
    const reset = deferredResponse();
    const fetcher = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === "POST" ? reset.promise : Response.json({ data: user }),
    );
    vi.stubGlobal("fetch", fetcher);
    const sessionBinding = "test-users-session";
    render(
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <AdminShell sessionBinding={sessionBinding} user={{ ...user, name: "Administrator" }}>
            <UserDetail userId={userId} intercepted />
          </AdminShell>
        </ToastProvider>
      </AdminI18nProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Reset password" }));
    const dialog = await screen.findByRole("dialog", { name: "Reset password" });
    passwords(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset password" }));
    expect(within(dialog).getByRole("button", { name: /saving/i })).toBeDisabled();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(ADMIN_SESSION_CHANGED_EVENT, { detail: sessionBinding }),
      );
    });
    expect(screen.getByRole("alert")).toHaveTextContent("The admin session changed");
    expect(dialog).not.toBeInTheDocument();
    expect(screen.queryByText(user.name)).toBeNull();
    await act(async () =>
      reset.resolve(Response.json({ data: { id: userId, status: user.status } })),
    );
    expect(screen.queryByText("Password reset.")).toBeNull();
    expect(screen.queryByText(user.login_phone_number)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["Activate", "activate", "pending_activation", "suspended", "Suspended", "Reactivate"],
    ["Suspend", "suspend", "active", "suspended", "Suspended", "Reactivate"],
    [
      "Reset password",
      "reset-password",
      "active",
      "deletion_requested",
      "Deletion requested",
      null,
    ],
  ] as const)(
    "reloads details and preserves the conflict notice after %s",
    async (action, endpoint, initialStatus, newStatus, statusLabel, newAction) => {
      let completeReload!: (response: Response) => void;
      const refreshed = new Promise<Response>((resolve) => {
        completeReload = resolve;
      });
      const conflict = { errors: [{ code: "account_state_conflict" }] };
      const post = vi.fn(() => Response.json(conflict, { status: 409 }));
      const load = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ data: { ...user, status: initialStatus } }))
        .mockReturnValueOnce(refreshed);
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_path: string, init?: RequestInit) =>
          init?.method === "POST" ? post() : load(),
        ),
      );
      show(<UserDetail userId={userId} />);
      const oldButton = await screen.findByRole("button", { name: action });
      fireEvent.click(oldButton);
      if (endpoint !== "activate") {
        const dialog = screen.getByRole("dialog", { name: action });
        if (endpoint === "reset-password") passwords(dialog);
        fireEvent.click(within(dialog).getByRole("button", { name: action }));
      }
      const notice = await screen.findByText(/account status has changed/i);
      expect(notice).toBeVisible();
      expect(load).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(oldButton).toBeDisabled();

      completeReload(
        Response.json({
          data: { ...user, status: newStatus, email: "member@example.com", email_verified: true },
        }),
      );
      expect(await screen.findByText(statusLabel)).toBeVisible();
      expect(screen.getByText("Verified")).toBeVisible();
      expect(screen.getByText(/account status has changed/i)).toBeVisible();
      expect(screen.queryByRole("button", { name: action })).toBeNull();
      expect(screen.queryByRole("button", { name: "Reset password" })).toBeNull();
      if (newAction) expect(screen.getByRole("button", { name: newAction })).toBeEnabled();
      expect(post).toHaveBeenCalledTimes(1);
    },
  );

  it("retries only the detail GET if refreshing after a conflict fails", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: user }))
      .mockResolvedValueOnce(Response.json({}, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ data: { ...user, status: "active" } }));
    const post = vi.fn(() =>
      Response.json({ errors: [{ code: "account_state_conflict" }] }, { status: 409 }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) =>
        init?.method === "POST" ? post() : load(),
      ),
    );
    show(<UserDetail userId={userId} />);
    const activate = await screen.findByRole("button", { name: "Activate" });
    fireEvent.click(activate);
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(activate).toBeDisabled();
    fireEvent.click(retry);
    expect(await screen.findByRole("button", { name: "Suspend" })).toBeEnabled();
    expect(screen.getByText(/account status has changed/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(load).toHaveBeenCalledTimes(3);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "vi",
      "Đặt lại mật khẩu",
      "Nhập lại mật khẩu",
      "password2",
      "Passwords do not match.",
      "Mật khẩu nhập lại không khớp.",
    ],
    [
      "en",
      "Reset password",
      "Confirm password",
      "password2",
      "Passwords do not match.",
      "Passwords do not match.",
    ],
    [
      "vi",
      "Đặt lại mật khẩu",
      "Mật khẩu mới",
      "password1",
      "This password is too short. It must contain at least 12 characters.",
      "Dữ liệu không hợp lệ ở trường: Mật khẩu mới.",
    ],
    [
      "en",
      "Reset password",
      "New password",
      "password1",
      "This password is too short. It must contain at least 12 characters.",
      "This password is too short. It must contain at least 12 characters.",
    ],
  ] as const)(
    "shows reset validation beside the right field in %s",
    async (locale, action, label, field, backendMessage, message) => {
      const fetcher = vi.fn(async (_path: string, init?: RequestInit) =>
        init?.method === "POST"
          ? Response.json({ [field]: [backendMessage] }, { status: 400 })
          : Response.json({ data: user }),
      );
      vi.stubGlobal("fetch", fetcher);
      show(<UserDetail userId={userId} />, locale);
      fireEvent.click(await screen.findByRole("button", { name: action }));
      const dialog = screen.getByRole("dialog", { name: action });
      const input = within(dialog).getByLabelText(label);
      const confirmation = field === "password2" ? "  different  " : password;
      const { password1, password2 } = passwords(dialog, password, confirmation, locale);
      fireEvent.click(within(dialog).getByRole("button", { name: action }));
      await within(dialog).findByText(message);
      expect(input).toHaveAccessibleDescription(message);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(password1).toHaveValue(password);
      expect(password2).toHaveValue(confirmation);
      expect(fetcher).toHaveBeenCalledWith(
        `/api/backend/admin/users/${userId}/reset-password`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ password1: password, password2: confirmation }),
        }),
      );
    },
  );

  it.each([
    [409, { errors: [{ code: "account_target_protected" }] }, /protected account/i],
    [409, { errors: [{ code: "email_recovery_required" }] }, /forgot password/i],
    [403, { detail: "Forbidden" }, /not allowed/i],
  ])("handles Django reset rejection %s", async (status, body, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) =>
        init?.method === "POST" ? Response.json(body, { status }) : Response.json({ data: user }),
      ),
    );
    show(<UserDetail userId={userId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reset password" }));
    const dialog = screen.getByRole("dialog", { name: "Reset password" });
    passwords(dialog, password, "different");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset password" }));
    const feedback = await within(dialog).findByText(message);
    expect(feedback).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(within(screen.getByRole("dialog")).getByLabelText(/^New password/i)).toHaveValue("");
  });

  it("finds a phone-only user for CSA and links the selected UUID", async () => {
    const fetcher = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json({ data: { id: "customer" } })
        : Response.json({ data: [user] }),
    );
    vi.stubGlobal("fetch", fetcher);
    show(
      <LinkCustomerUserDialog
        customerId="customer"
        fallbackFocusRef={{ current: null }}
        onCancel={vi.fn()}
        onLinked={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "0912345678" } });
    fireEvent.submit(screen.getByRole("form", { name: /find account/i }));
    expect(await screen.findByText(user.login_phone_number)).toBeVisible();
    expect(fetcher.mock.calls[0][0]).toBe("/api/backend/admin/users?page=1&search=0912345678");
    fireEvent.click(screen.getByRole("radio", { name: /Garden Member/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm link" }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        "/api/backend/admin/csa-customers/customer/link-user",
        expect.objectContaining({ body: JSON.stringify({ user_id: userId }) }),
      ),
    );
  });

  it.each([
    ["is absent", [otherUser]],
    ["is already linked", [{ ...user, has_csa_customer: true }, otherUser]],
  ] as const)(
    "requires a fresh CSA selection when the previous result %s",
    async (_scenario, results) => {
      const nextSearch = deferredResponse();
      const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
        if (init?.method === "POST") return Response.json({ data: { id: "customer" } });
        return path.includes("search=garden")
          ? Response.json({ data: [user] })
          : nextSearch.promise;
      });
      vi.stubGlobal("fetch", fetcher);
      const onLinked = vi.fn();
      show(
        <LinkCustomerUserDialog
          customerId="customer"
          fallbackFocusRef={{ current: null }}
          onCancel={vi.fn()}
          onLinked={onLinked}
        />,
      );
      const search = screen.getByRole("searchbox");
      const form = screen.getByRole("form", { name: /find account/i });
      fireEvent.change(search, { target: { value: "garden" } });
      fireEvent.submit(form);
      fireEvent.click(await screen.findByRole("radio", { name: /Garden Member/ }));
      expect(screen.getByRole("button", { name: "Confirm link" })).toBeEnabled();

      fireEvent.change(search, { target: { value: "orchard" } });
      fireEvent.submit(form);
      expect(screen.queryByRole("radio", { name: /Garden Member/ })).toBeNull();
      const loadingConfirm = screen.getByRole("button", { name: /linking/i });
      expect(loadingConfirm).toBeDisabled();
      fireEvent.click(loadingConfirm);
      await act(async () => nextSearch.resolve(Response.json({ data: results })));

      const confirm = screen.getByRole("button", { name: "Confirm link" });
      fireEvent.click(confirm);
      expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toEqual([]);
      expect(confirm).toBeDisabled();
      if (results.length > 1) {
        expect(screen.getByRole("radio", { name: /Garden Member/ })).toBeDisabled();
      }

      fireEvent.click(screen.getByRole("radio", { name: /Orchard Member/ }));
      fireEvent.click(confirm);
      await waitFor(() => expect(onLinked).toHaveBeenCalledWith({ id: "customer" }));
      const posts = fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
      expect(posts).toEqual([
        [
          "/api/backend/admin/csa-customers/customer/link-user",
          expect.objectContaining({ body: JSON.stringify({ user_id: otherUserId }) }),
        ],
      ]);
    },
  );

  it("discards CSA results after a failed search and links only the next valid selection", async () => {
    const failedSearch = deferredResponse();
    let orchardSearches = 0;
    const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json({ data: { id: "customer" } });
      if (path.includes("search=garden")) return Response.json({ data: [user] });
      return ++orchardSearches === 1 ? failedSearch.promise : Response.json({ data: [otherUser] });
    });
    vi.stubGlobal("fetch", fetcher);
    const onLinked = vi.fn();
    show(
      <LinkCustomerUserDialog
        customerId="customer"
        fallbackFocusRef={{ current: null }}
        onCancel={vi.fn()}
        onLinked={onLinked}
      />,
    );

    const search = screen.getByRole("searchbox");
    const form = screen.getByRole("form", { name: /find account/i });
    fireEvent.change(search, { target: { value: "garden" } });
    fireEvent.submit(form);
    const gardenOption = await screen.findByRole("radio", { name: /Garden Member/ });
    fireEvent.click(gardenOption.closest(".assignment-user")!);
    expect(gardenOption).toBeChecked();
    expect(screen.getByRole("button", { name: "Confirm link" })).toBeEnabled();

    fireEvent.change(search, { target: { value: "orchard" } });
    fireEvent.submit(form);
    expect(screen.getByRole("button", { name: /linking/i })).toBeDisabled();
    await act(async () => failedSearch.resolve(Response.json({}, { status: 500 })));
    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.queryByRole("radio", { name: /Garden Member/ })).toBeNull();
    const confirm = screen.getByRole("button", { name: "Confirm link" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toEqual([]);

    fireEvent.submit(form);
    fireEvent.click(await screen.findByRole("radio", { name: /Orchard Member/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm link" }));
    await waitFor(() => expect(onLinked).toHaveBeenCalledWith({ id: "customer" }));
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toEqual([
      [
        "/api/backend/admin/csa-customers/customer/link-user",
        expect.objectContaining({ body: JSON.stringify({ user_id: otherUserId }) }),
      ],
    ]);
  });
});
