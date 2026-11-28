"use client";

import { Anchor, createPolymorphicComponent, type AnchorProps } from "@mantine/core";
import type { Ref } from "react";

export const DataListRecordLink = createPolymorphicComponent<"a", AnchorProps>(
  function DataListRecordLink(props: AnchorProps & { ref?: Ref<HTMLAnchorElement> }) {
    return <Anchor {...props} c="var(--primary)" fw={600} underline="never" />;
  },
);
