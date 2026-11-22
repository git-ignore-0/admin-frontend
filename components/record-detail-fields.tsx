import { Box, SimpleGrid, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

export function RecordDetailFields({ children }: { children: ReactNode }) {
  return (
    <SimpleGrid component="dl" type="container" cols={{ base: 1, "26rem": 2 }} spacing="sm" m={0}>
      {children}
    </SimpleGrid>
  );
}

export function RecordDetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={4} miw={0}>
      <Text component="dt" size="sm" c="dimmed">
        {label}
      </Text>
      <Box component="dd" m={0} style={{ overflowWrap: "anywhere" }}>
        {children || "—"}
      </Box>
    </Stack>
  );
}
