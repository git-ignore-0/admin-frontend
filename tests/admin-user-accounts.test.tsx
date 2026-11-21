import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { LinkCustomerUserDialog } from "@/components/link-customer-user-dialog";
import { ToastProvider } from "@/components/toast-provider";
import { UserDetail } from "@/components/user-detail";
import { UserDirectory } from "@/components/user-directory";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
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
const password = "  Strong-Harvest-42!  ";

function scene(children: React.ReactNode, initialLocale: "en" | "vi" = "en") {
  return (
    <AdminI18nProvider initialLocale={initialLocale}>
      <ToastProvider>{children}</ToastProvider>
    </AdminI18nProvider>
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("CMS account administration", () => {
  it("shows Chờ kích hoạt and the login phone independently of historical contact data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: [user], meta: listMeta })),
    );
    show(<UserDirectory />, "vi");
    const row = await screen.findByRole("row", { name: /Garden Member/ });
    expect(within(row).getByText("Chờ kích hoạt")).toBeVisible();
    expect(within(row).getByText("Chưa có email")).toBeVisible();
    expect(within(row).getByText(user.login_phone_number)).toBeVisible();
    expect(within(row).queryByText(user.phone)).toBeNull();
    expect(screen.getByRole("columnheader", { name: "SĐT đăng nhập" })).toBeVisible();
  });

  it("creates a phone-only account and opens its detail with the password preserved in the POST", async () => {
    let resolveCreate!: (response: Response) => void;
    const create = new Promise<Response>((resolve) => {
      resolveCreate = resolve;
    });
    const fetcher = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === "POST" ? create : Response.json({ data: [], meta: listMeta }),
    );
    vi.stubGlobal("fetch", fetcher);
    show(<UserDirectory />);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    const dialog = screen.getByRole("dialog", { name: "Create account" });
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
    resolveCreate(
      Response.json({ data: { id: userId, status: "pending_activation" } }, { status: 201 }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/users/${userId}`));
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
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    const dialog = screen.getByRole("dialog", { name: "Create account" });
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
    fireEvent.click(screen.getByRole("button", { name: copy.create }));
    const dialog = screen.getByRole("dialog", { name: copy.create });
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

  it("activates, suspends after confirmation, and reactivates using a fresh detail projection", async () => {
    let status = user.status;
    const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        status = path.endsWith("/suspend") ? "suspended" : "active";
        return Response.json({ data: { id: userId, status } });
      }
      return Response.json({
        data: { ...user, status },
        meta: { invited: listMeta },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    show(<UserDetail userId={userId} />);
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
      expect(await screen.findByText(nextStatus)).toBeVisible();
      expect(fetcher).toHaveBeenCalledWith(
        path,
        expect.objectContaining({ method: "POST", body: "{}" }),
      );
      expect(screen.getByText("NFV1234567")).toBeVisible();
      expect(screen.getByText("Invited Member")).toBeVisible();
      expect(screen.getByText("50")).toBeVisible();
    }
    expect(fetcher.mock.calls.filter(([, init]) => init?.method !== "POST")).toHaveLength(4);
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
