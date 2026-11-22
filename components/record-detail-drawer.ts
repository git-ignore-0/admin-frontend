import type {
  DrawerCloseButtonProps,
  DrawerRootProps,
  GroupProps,
  StackProps,
  TextProps,
} from "@mantine/core";
import layout from "./overlay-layout.module.css";

/** Visual defaults for native record drawers. The caller owns content, actions and focus. */
export const recordDetailDrawer = {
  root: {
    position: "right",
    size: 640,
    padding: "md",
    radius: 0,
    classNames: {
      content: `${layout.content} ${layout.recordDetailContent}`,
      body: layout.body,
    },
    styles: { title: { fontSize: "var(--mantine-font-size-lg)", fontWeight: 600 } },
  },
  identity: { gap: 4, miw: 0 },
  metadata: { size: "sm", c: "dimmed" },
  closeButton: {
    size: 32,
    iconSize: 18,
    c: "dimmed",
    style: { alignSelf: "flex-start", flexShrink: 0 },
  },
  footer: { className: layout.footer, gap: "xs", justify: "space-between", px: "md", py: "sm" },
} satisfies {
  root: Omit<DrawerRootProps, "opened" | "onClose">;
  identity: StackProps;
  metadata: TextProps;
  closeButton: DrawerCloseButtonProps;
  footer: GroupProps;
};
