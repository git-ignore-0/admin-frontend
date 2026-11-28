"use client";

import { Box, Button, Collapse, Group, List, Text } from "@mantine/core";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useId, useState, type ReactNode } from "react";

export function LockDisclosure({
  summary,
  showLabel,
  hideLabel,
  children,
}: {
  summary: string;
  showLabel: string;
  hideLabel: string;
  children?: ReactNode;
}) {
  const reasonsId = useId();
  const summaryId = useId();
  const [opened, setOpened] = useState(false);

  if (!children) return <Text size="sm">{summary}</Text>;

  return (
    <Box>
      <Group gap="xs" align="baseline">
        <Text id={summaryId} size="sm">
          {summary}
        </Text>
        <Button
          type="button"
          size="xs"
          variant="subtle"
          rightSection={
            opened ? (
              <IconChevronUp size={14} aria-hidden />
            ) : (
              <IconChevronDown size={14} aria-hidden />
            )
          }
          aria-controls={reasonsId}
          aria-describedby={summaryId}
          aria-expanded={opened}
          onClick={() => setOpened((current) => !current)}
        >
          {opened ? hideLabel : showLabel}
        </Button>
      </Group>
      <Box id={reasonsId}>
        <Collapse in={opened}>{children}</Collapse>
      </Box>
    </Box>
  );
}

export function LockReasonList({ children }: { children: ReactNode }) {
  return (
    <List size="sm" spacing="xs" mt="xs" withPadding style={{ overflowWrap: "anywhere" }}>
      {children}
    </List>
  );
}
