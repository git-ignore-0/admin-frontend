import { Stack, Table, Text } from "@mantine/core";

import type { AdminLocale } from "@/lib/admin-i18n";
import { farmerSupplyCopy } from "@/lib/farmer-supply-copy";
import { formatStockQuantityTotal } from "@/lib/farm-stock";
import type { SupplyRequest } from "@/lib/farm-supply-request-api";
import { formatDecimalInput } from "@/lib/numeric-input";

export function SupplyRequestProducts({
  items,
  locale,
}: {
  items: SupplyRequest["items"];
  locale: AdminLocale;
}) {
  const c = farmerSupplyCopy[locale];
  const number = new Intl.NumberFormat(locale);
  return (
    <Table.ScrollContainer minWidth={410}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col">{c.products}</Table.Th>
            <Table.Th scope="col">{c.unit}</Table.Th>
            <Table.Th scope="col" ta="right">
              {c.quantity}
            </Table.Th>
            <Table.Th scope="col" ta="right">
              {c.converted}
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => {
            const unit = locale === "vi" ? item.unit_label_vi : item.unit_label_en;
            return (
              <Table.Tr key={item.product_id}>
                <Table.Td>
                  <Stack gap={4}>
                    <Text fw={600}>{locale === "vi" ? item.name_vi : item.name_en}</Text>
                    <Text size="sm" c="dimmed">
                      {item.sku}
                    </Text>
                  </Stack>
                </Table.Td>
                <Table.Td>
                  {formatDecimalInput(item.unit_size)} {unit}
                </Table.Td>
                <Table.Td ta="right">{number.format(item.quantity_units)}</Table.Td>
                <Table.Td ta="right">
                  {formatStockQuantityTotal(item.quantity_units, item.unit_size, unit)}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
