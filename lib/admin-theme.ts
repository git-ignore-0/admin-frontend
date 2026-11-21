"use client";

import {
  ComboboxTarget,
  createTheme,
  type CSSVariablesResolver,
  type MantineTheme,
  type TableScrollContainerProps,
} from "@mantine/core";

/** Foundation defaults; domain states choose their semantic color at the call site. */
export const adminTheme = createTheme({
  primaryColor: "forest",
  primaryShade: 7,
  colors: {
    gray: [
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
    ],
    forest: [
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
    ],
  },
  fontFamily: '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSizes: { xs: "0.6875rem", sm: "0.78125rem", md: "0.8125rem", lg: "1rem", xl: "1.125rem" },
  black: "#202938",
  lineHeights: { md: "1.48" },
  headings: {
    fontFamily:
      '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeight: "700",
    sizes: { h1: { fontSize: "1.625rem" }, h2: { fontSize: "1.125rem" }, h3: { fontSize: "1rem" } },
  },
  spacing: { xs: "0.5rem", sm: "0.75rem", md: "1rem", lg: "1.5rem", xl: "2rem" },
  radius: { xs: "0.25rem", sm: "0.375rem", md: "0.5rem", lg: "0.625rem", xl: "1rem" },
  defaultRadius: "md",
  respectReducedMotion: true,
  shadows: { xs: "0 1px 2px rgb(22 40 30 / 4%)", sm: "0 4px 16px rgb(22 40 30 / 8%)" },
  components: {
    ComboboxTarget: ComboboxTarget.extend({ defaultProps: { withExpandedAttribute: true } }),
    // Normal controls: Mantine sm (36px); compact row/editor actions: xs (30px).
    Button: { defaultProps: { size: "sm", fw: 600 }, styles: { label: { gap: 7 } } },
    ActionIcon: { defaultProps: { size: 36, variant: "subtle" } },
    TextInput: { defaultProps: { size: "sm" } },
    PasswordInput: { defaultProps: { size: "sm" } },
    NumberInput: { defaultProps: { size: "sm" } },
    Select: { defaultProps: { size: "sm", allowDeselect: false, checkIconPosition: "right" } },
    Textarea: { defaultProps: { size: "sm" } },
    Badge: {
      defaultProps: { size: "md", radius: "sm", variant: "light", tt: "none", fw: 600 },
      styles: {
        root: {
          whiteSpace: "normal",
          height: "auto",
          minHeight: "var(--badge-height)",
          lineHeight: 1.4,
        },
      },
    },
    Checkbox: { defaultProps: { size: "sm" } },
    Radio: { defaultProps: { size: "sm" } },
    Tabs: { defaultProps: { keepMounted: true } },
    Paper: { defaultProps: { withBorder: true, radius: "lg", shadow: "none" } },
    Modal: {
      defaultProps: {
        centered: true,
        radius: "lg",
        overlayProps: { backgroundOpacity: 0.25, blur: 1 },
      },
    },
    Table: {
      defaultProps: {
        horizontalSpacing: "md",
        verticalSpacing: "sm",
        highlightOnHover: true,
        withTableBorder: false,
      },
      styles: {
        th: {
          background: "var(--mantine-color-gray-0)",
          color: "var(--mantine-color-gray-7)",
          fontSize: "var(--mantine-font-size-xs)",
        },
      },
    },
    TableScrollContainer: {
      styles: (_theme: MantineTheme, { type }: TableScrollContainerProps) =>
        type === "native"
          ? { scrollContainer: { overflowX: "var(--nfv-table-overflow-x, var(--table-overflow))" } }
          : {},
    },
    Title: { styles: { root: { color: "var(--nfv-heading-color)" } } },
    AppShell: {
      styles: {
        header: {
          background: "var(--mantine-color-white)",
          borderColor: "var(--mantine-color-default-border)",
        },
        navbar: { borderColor: "var(--mantine-color-default-border)" },
      },
    },
    NavLink: {
      defaultProps: { variant: "light" },
      styles: {
        root: { borderRadius: 7, minHeight: 35, padding: "8px 10px" },
        label: { fontSize: "var(--mantine-font-size-sm)" },
        section: { marginInlineEnd: 10 },
      },
    },
  },
});

/** V5.1 is the visual baseline; both Mantine and retained module CSS share these tokens. */
export const adminCssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    "--background": "#f7f8fa",
    "--surface": "#ffffff",
    "--surface-subtle": "#f4f6f8",
    "--text": "#202938",
    "--text-muted": "#5a6676",
    "--border": "#e2e6eb",
    "--border-strong": "#ced4da",
    "--primary": "#1f7c4d",
    "--primary-hover": "#17633d",
    "--primary-soft": "#eaf6ef",
    "--radius": "10px",
    "--nfv-heading-color": "#17212e",
    "--nfv-subtle-color": "#687483",
  },
  light: {
    "--mantine-color-body": "#f7f8fa",
    "--mantine-color-text": "#202938",
    "--mantine-color-dimmed": "#5a6676",
    "--mantine-color-default-color": "#202938",
    "--mantine-color-default-border": "#e2e6eb",
    "--mantine-color-placeholder": "#687483",
    "--mantine-primary-color-light": "#eaf6ef",
    "--mantine-primary-color-light-color": "#17633d",
  },
  dark: {},
});
