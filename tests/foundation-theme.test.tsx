import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Drawer,
  MantineProvider,
  Modal,
  Notification,
  TextInput,
} from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { adminCssVariablesResolver, adminTheme, adminTokens } from "@/lib/admin-theme";
import classes from "@/lib/admin-theme.module.css";

afterEach(cleanup);

function contrast(first: string, second: string) {
  const luminance = (hex: string) => {
    expect(hex).toMatch(/^#[\da-f]{6}$/i);
    const [red, green, blue] = hex
      .slice(1)
      .match(/../g)!
      .map((channel) => {
        const sRgb = Number.parseInt(channel, 16) / 255;
        return sRgb <= 0.04045 ? sRgb / 12.92 : ((sRgb + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [darker, lighter] = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (lighter + 0.05) / (darker + 0.05);
}

function readColor(variable: string) {
  const style = getComputedStyle(document.documentElement);
  let value = style.getPropertyValue(variable).trim();
  while (value.startsWith("var(")) value = style.getPropertyValue(value.slice(4, -1)).trim();
  return value;
}

const statuses = [
  ["success", "green", "#1f6b3b", "#eaf5ed"],
  ["pending", "yellow", "#785600", "#fff9db"],
  ["warning", "orange", "#8a4b08", "#fdf3e3"],
  ["danger", "red", "#b3261e", "#fce8e6"],
  ["info", "blue", "#195a9b", "#e7f5ff"],
  ["neutral", "gray", "#526173", "#edf0f2"],
] as const;

function renderTheme(children: React.ReactNode) {
  return render(
    <MantineProvider
      theme={adminTheme}
      cssVariablesResolver={adminCssVariablesResolver}
      forceColorScheme="light"
    >
      {children}
    </MantineProvider>,
  );
}

describe("admin color foundation", () => {
  it("keeps the approved brand palettes, primary shade, and shared Light scheme", () => {
    renderTheme(<TextInput label="Example" />);
    expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "light");
    expect(adminTheme.primaryColor).toBe("forest");
    expect(adminTheme.primaryShade).toBe(7);
    expect(adminTheme.colors?.forest).toEqual([
      "#f0faf3",
      "#e1f5e8",
      "#bfe7cc",
      "#90d5a8",
      "#62c184",
      "#3aa868",
      "#248d53",
      "#1f7c4d",
      "#17633d",
      "#144a2f",
    ]);
    expect(adminTheme.colors?.gray).toEqual([
      "#f7f8fa",
      "#edf0f2",
      "#e5e9ed",
      "#d8dfe5",
      "#b9c3cc",
      "#919eaa",
      "#6d7b8b",
      "#526173",
      "#334151",
      "#202c38",
    ]);
    expect(readColor("--mantine-color-body")).toBe(readColor("--background"));
    expect(readColor("--mantine-color-error")).toBe(readColor("--danger"));
    expect(readColor("--mantine-color-placeholder")).toBe(readColor("--text-subtle"));
    expect(readColor("--mantine-color-disabled")).toBe(readColor("--surface-disabled"));
    expect(readColor("--mantine-color-disabled-color")).toBe(readColor("--text-disabled"));
    expect(readColor("--nfv-heading-color")).toBe(readColor("--heading"));
    expect(readColor("--nfv-subtle-color")).toBe(readColor("--text-subtle"));
    expect(readColor("--mantine-primary-color-filled")).toBe(readColor("--primary"));
    expect(readColor("--mantine-primary-color-filled-hover")).toBe(readColor("--primary-hover"));
    expect(adminTokens).toEqual({
      background: "#f7f8fa",
      surface: "#ffffff",
      "surface-subtle": "#f4f6f8",
      text: "#202938",
      heading: "#17212e",
      "text-muted": "#5a6676",
      "text-subtle": "#687483",
      "text-inverse": "#ffffff",
      border: "#e2e6eb",
      "border-strong": "#ced4da",
      "control-border": "#6d7b8b",
      primary: "#1f7c4d",
      "primary-hover": "#17633d",
      "primary-soft": "#eaf6ef",
      "surface-hover": "#f4f6f8",
      "surface-selected": "#eaf6ef",
      "surface-disabled": "#edf0f2",
      "text-disabled": "#687483",
      focus: "#1a73e8",
      overlay: "rgba(32, 41, 56, 0.25)",
    });
    for (const [name, value] of Object.entries(adminTokens)) {
      expect(readColor(`--${name}`)).toBe(value);
    }
  });

  it.each(statuses)(
    "uses the approved %s pair and preserves the %s alias",
    (role, alias, foreground, background) => {
      renderTheme(
        <>
          <Badge color={role} data-testid="badge">
            Status
          </Badge>
          <Alert color={alias} title="Alert" icon={<svg aria-hidden />} data-testid="alert">
            Message
          </Alert>
          <Notification
            color={role}
            title="Notification"
            icon={<svg aria-hidden />}
            closeButtonProps={{ "aria-label": "Dismiss notification" }}
            data-testid="notification"
          >
            Notice
          </Notification>
        </>,
      );
      expect(readColor(`--mantine-color-${role}-light-color`)).toBe(foreground);
      expect(readColor(`--mantine-color-${role}-light`)).toBe(background);
      expect(readColor(`--mantine-color-${alias}-light-color`)).toBe(foreground);
      expect(readColor(`--mantine-color-${alias}-light`)).toBe(background);
      expect(screen.getByTestId("badge")).toHaveStyle({
        "--badge-color": `var(--mantine-color-${role}-light-color)`,
        "--badge-bg": `var(--mantine-color-${role}-light)`,
      });
      expect(screen.getByTestId("alert")).toHaveStyle({
        "--alert-color": `var(--mantine-color-${alias}-light-color)`,
        "--alert-bg": `var(--mantine-color-${alias}-light)`,
      });
      expect(screen.getByText("Message")).toHaveStyle({ color: "var(--alert-color)" });
      expect(screen.getByTestId("notification")).toHaveStyle({
        "--notification-color": `var(--mantine-color-${role}-filled)`,
        backgroundColor: `var(--${role}-soft)`,
      });
      const semanticText = { color: `var(--${role})` };
      expect(screen.getByText("Notification")).toHaveStyle(semanticText);
      expect(screen.getByText("Notice")).toHaveStyle(semanticText);
      expect(screen.getByRole("button", { name: "Dismiss notification" })).toHaveStyle(semanticText);
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(readColor("--text-inverse"), foreground)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("shares the control border only on default Button and ActionIcon variants", () => {
    const variants = ["default", "filled", "light", "subtle", "transparent", "outline"] as const;
    renderTheme(
      <>
        {variants.map((variant) => (
          <div key={variant}>
            <Button variant={variant}>{variant} button</Button>
            <ActionIcon variant={variant} aria-label={`${variant} icon`} />
          </div>
        ))}
        <ActionIcon aria-label="Implicit icon" />
      </>,
    );
    for (const variant of variants) {
      const button = screen.getByRole("button", { name: `${variant} button` });
      const icon = screen.getByRole("button", { name: `${variant} icon` });
      if (variant === "default") {
        expect(button).toHaveClass(classes.defaultControl);
        expect(icon).toHaveClass(classes.defaultControl);
        expect(button).toHaveStyle({
          "--button-bd": "calc(0.0625rem * var(--mantine-scale)) solid var(--mantine-color-default-border)",
        });
        expect(icon).toHaveStyle({
          "--ai-bd": "calc(0.0625rem * var(--mantine-scale)) solid var(--mantine-color-default-border)",
        });
        continue;
      }
      expect(button).not.toHaveClass(classes.defaultControl);
      expect(icon).not.toHaveClass(classes.defaultControl);
    }
    const implicitIcon = screen.getByRole("button", { name: "Implicit icon" });
    expect(implicitIcon).toHaveAttribute("data-variant", "subtle");
    expect(implicitIcon).toHaveStyle({ "--ai-size": "calc(2.25rem * var(--mantine-scale))" });
    expect(implicitIcon).not.toHaveClass(classes.defaultControl);
  });

  it("meets normal text contrast for active actions, inputs, and overlay content", () => {
    renderTheme(<Button color="red">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" })).toHaveStyle({
      "--button-bg": "var(--mantine-color-red-filled)",
      "--button-hover": "var(--mantine-color-red-filled-hover)",
    });
    expect(readColor("--mantine-color-red-filled-hover")).toBe("#8c1d18");
    const normalTextPairs = [
      ["--text", "--background"],
      ["--text", "--surface-hover"],
      ["--heading", "--surface"],
      ["--text-muted", "--background"],
      ["--text-muted", "--surface-disabled"],
      ["--text-muted", "--surface-selected"],
      ["--text-subtle", "--surface"],
      ["--primary", "--background"],
      ["--primary-hover", "--surface-selected"],
      ["--text-inverse", "--primary"],
      ["--text-inverse", "--primary-hover"],
      ["--text-inverse", "--danger"],
      ["--text-inverse", "--danger-hover"],
      ["--text-inverse", "--heading"],
      ["--danger", "--surface"],
    ];
    for (const [foreground, background] of normalTextPairs) {
      expect(
        contrast(readColor(foreground), readColor(background)),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("meets non-text contrast at control and focus boundaries and records the inactive exception", () => {
    renderTheme(<TextInput label="Disabled" disabled />);
    for (const background of [
      "--surface",
      "--background",
      "--surface-hover",
      "--surface-selected",
    ]) {
      expect(contrast(readColor("--control-border"), readColor(background))).toBeGreaterThanOrEqual(
        3,
      );
      expect(contrast(readColor("--focus"), readColor(background))).toBeGreaterThanOrEqual(3);
    }
    const disabledContrast = contrast(
      readColor("--text-disabled"),
      readColor("--surface-disabled"),
    );
    expect(disabledContrast).toBeCloseTo(4.16, 2);
  });

  it("uses the foundation surfaces and overlay for portalled dialogs and compound drawers", () => {
    const nativeDrawer = renderTheme(
      <Drawer opened onClose={() => {}} title="Navigation" transitionProps={{ duration: 0 }} />,
    );
    expect(screen.getByRole("dialog", { name: "Navigation" })).toHaveStyle({
      backgroundColor: "var(--background)",
      color: "var(--text)",
    });
    expect(nativeDrawer.container).not.toContainElement(screen.getByRole("dialog"));
    expect(document.querySelector(".mantine-Drawer-overlay")).toHaveClass(classes.dialogOverlay);
    nativeDrawer.unmount();

    const { container, unmount } = renderTheme(
      <Drawer.Root opened onClose={() => {}} transitionProps={{ duration: 0 }}>
        <Drawer.Overlay data-testid="drawer-overlay" />
        <Drawer.Content>
          <Drawer.Header data-testid="drawer-header">
            <Drawer.Title>Details</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body>Drawer content</Drawer.Body>
        </Drawer.Content>
      </Drawer.Root>,
    );
    const drawer = screen.getByRole("dialog", { name: "Details" });
    expect(container).not.toContainElement(drawer);
    expect(drawer).toHaveStyle({ backgroundColor: "var(--background)", color: "var(--text)" });
    expect(screen.getByTestId("drawer-header")).toHaveStyle({ backgroundColor: "var(--surface)" });
    expect(screen.getByTestId("drawer-overlay").className).toContain("dialogOverlay");
    unmount();

    renderTheme(
      <Modal opened onClose={() => {}} title="Edit" transitionProps={{ duration: 0 }}>
        Modal content
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Edit" })).toHaveStyle({
      backgroundColor: "var(--surface)",
      color: "var(--text)",
    });
  });
});
