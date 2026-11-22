"use client";

import { Anchor, Group } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { AdminNavigationLink } from "@/components/admin-navigation-link";

export function DetailBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Anchor component={AdminNavigationLink} href={href} size="sm" w="fit-content">
      <Group component="span" gap={6}>
        <IconArrowLeft size={16} aria-hidden />
        <span>{label}</span>
      </Group>
    </Anchor>
  );
}
