"use client";

import { Skeleton, Table } from "@mantine/core";

/** Placeholder rows for the same Table header and scroll container used by the loaded list. */
export function TableSkeletonRows({
  columns,
  height = 16,
  alignments,
}: {
  columns: number;
  height?: number;
  alignments?: readonly ("left" | "center" | "right" | undefined)[];
}) {
  return [0, 1, 2].map((row) => (
    <Table.Tr key={row}>
      {Array.from({ length: columns }, (_, column) => {
        const alignment = alignments?.[column];
        return (
          <Table.Td key={column} ta={alignment}>
            <Skeleton
              height={height}
              width="75%"
              ml={alignment === "right" ? "auto" : undefined}
              mx={alignment === "center" ? "auto" : undefined}
            />
          </Table.Td>
        );
      })}
    </Table.Tr>
  ));
}
