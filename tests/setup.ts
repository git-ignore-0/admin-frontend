import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { MantineProvider } from "@mantine/core";
import { vi } from "vitest";
import { adminTheme } from "@/lib/admin-theme";

// jsdom lacks layout APIs used by official Mantine overlays and inputs.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    // No animation frames should outlive jsdom teardown. Mantine still owns the interactions.
    matches: query.includes("prefers-reduced-motion: reduce"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "ResizeObserver", { writable: true, value: TestResizeObserver });
window.HTMLElement.prototype.scrollIntoView = vi.fn();

vi.mock("@testing-library/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@testing-library/react")>();
  return {
    ...actual,
    render: (ui: React.ReactNode, options: Parameters<typeof actual.render>[1] = {}) => {
      const OriginalWrapper = options.wrapper;
      return actual.render(ui, {
        ...options,
        wrapper: ({ children }: { children: React.ReactNode }) =>
          createElement(
            MantineProvider,
            { theme: adminTheme, forceColorScheme: "light", env: "test" },
            OriginalWrapper ? createElement(OriginalWrapper, null, children) : children,
          ),
      });
    },
  };
});
