import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProtectedLayout from "@/app/(admin)/layout";
import UiFoundationPage from "@/app/(admin)/dev/ui-foundation/page";
import { adminDictionaries } from "@/lib/admin-i18n";
import { adminNavigation } from "@/lib/admin-navigation";
import { adminSessionBinding, readSession, type AdminSession } from "@/lib/session";

const { loadShowcase } = vi.hoisted(() => ({ loadShowcase: vi.fn() }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));
vi.mock("@/lib/session", () => ({ readSession: vi.fn(), adminSessionBinding: vi.fn() }));
vi.mock("@/components/admin-shell", () => ({
  AdminShell: ({
    children,
    sessionBinding,
  }: {
    children: React.ReactNode;
    sessionBinding: string;
  }) => <main data-admin-session={sessionBinding}>{children}</main>,
}));
vi.mock("@/components/ui-foundation-showcase", () => {
  loadShowcase();
  return {
    UiFoundationShowcase: () => <h1>Component Showcase</h1>,
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const session: AdminSession = {
  accessToken: "test-access",
  refreshToken: "test-refresh",
  expiresAt: 0,
  user: {
    id: "test-admin",
    name: "Local admin",
    locale: "vi",
    roles: ["website_admin"],
    email: null,
    email_verified: false,
    login_phone_number: null,
  },
};

describe("UI Foundation development route", () => {
  it.each(["production", "test"])(
    "does not load or render the Showcase in %s",
    async (environment) => {
      vi.stubEnv("NODE_ENV", environment);
      await expect(UiFoundationPage()).rejects.toThrow("NOT_FOUND");
      expect(loadShowcase).not.toHaveBeenCalled();
    },
  );

  it("requires the existing protected layout even in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.mocked(readSession).mockResolvedValue(null);
    await expect(ProtectedLayout({ children: null })).rejects.toThrow("REDIRECT /login");
  });

  it("renders the development Showcase under the normal session-bound shell", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.mocked(readSession).mockResolvedValue(session);
    vi.mocked(adminSessionBinding).mockReturnValue("local-binding");
    render(await ProtectedLayout({ children: await UiFoundationPage() }));
    expect(screen.getByRole("main")).toHaveAttribute("data-admin-session", "local-binding");
    expect(screen.getByRole("heading", { name: "Component Showcase" })).toBeVisible();
    expect(adminSessionBinding).toHaveBeenCalledWith(session);
  });

  it("does not expose the route in either admin navigation language", () => {
    for (const t of Object.values(adminDictionaries)) {
      const items = adminNavigation(t).flatMap(({ items }) => items);
      expect(items.some(({ href }) => href.startsWith("/dev/"))).toBe(false);
    }
  });
});
