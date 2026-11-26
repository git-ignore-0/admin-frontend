"use client";

import { Anchor, Box, Button, Collapse, Group, List, Text } from "@mantine/core";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import Link from "next/link";
import { useId, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { Status } from "@/components/nfv-controls";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import type { ProductLockReason, ProductStatus } from "@/lib/types";

export function ProductLifecycleStatus({ status }: { status: ProductStatus }) {
  const {
    t: { storeCatalog: copy },
  } = useAdminI18n();
  if (status === "draft")
    return <Status domain="publication" status="draft" label={copy.productDraft} />;
  if (status === "active")
    return <Status domain="availability" status="active" label={copy.selling} />;
  return <Status domain="availability" status="inactive" label={copy.discontinued} />;
}

export function ProductLockDisclosure({
  summary,
  reasons,
}: {
  summary: string;
  reasons: ProductLockReason[];
}) {
  const {
    t: { storeCatalog: copy },
  } = useAdminI18n();
  const reasonsId = useId();
  const summaryId = useId();
  const [opened, setOpened] = useState(false);

  if (!reasons.length) return <Text size="sm">{summary}</Text>;

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
          {opened ? copy.hideProductLockReasons : copy.showProductLockReasons}
        </Button>
      </Group>
      <Box id={reasonsId}>
        <Collapse in={opened}>
          <ProductLockReasons reasons={reasons} />
        </Collapse>
      </Box>
    </Box>
  );
}

export function ProductLockReasons({ reasons }: { reasons: ProductLockReason[] }) {
  const {
    locale,
    t: { storeCatalog: copy },
  } = useAdminI18n();
  if (!reasons.length) return null;
  return (
    <List size="sm" spacing="xs" mt="xs" withPadding style={{ overflowWrap: "anywhere" }}>
      {reasons.map((reason) => {
        const farm = ["stock_batch", "legacy_supply", "farm_link"].includes(reason.code);
        const order = ["store_order", "store_reservation"].includes(reason.code);
        const id = farm ? reason.farm_id : reason.id;
        const path = farm ? "/farms" : order ? "/store-orders" : "/csa-rounds";
        const farmName =
          locale === "vi"
            ? reason.farm_name_vi || reason.farm_name_en
            : reason.farm_name_en || reason.farm_name_vi;
        const reference = (farm ? farmName : reason.label) || id;
        const href = id && UUID_PATH_SEGMENT.test(id) ? `${path}/${id}` : null;
        return (
          <List.Item key={reason.code}>
            {copy.productLockReasons[reason.code]}
            {reference && (
              <>
                {" · "}
                {href ? (
                  <Anchor component={Link} href={href} size="sm">
                    {reference}
                  </Anchor>
                ) : (
                  <Text component="span" size="sm">
                    {reference}
                  </Text>
                )}
              </>
            )}
          </List.Item>
        );
      })}
    </List>
  );
}
