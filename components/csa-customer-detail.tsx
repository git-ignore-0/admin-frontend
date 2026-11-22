"use client";

import {
  Anchor,
  Button,
  Drawer,
  Group,
  Paper,
  Skeleton,
  Stack,
  Title,
  VisuallyHidden,
  getDefaultZIndex,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconArrowLeft } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { CustomerMembershipCard } from "@/components/customer-membership-card";
import { LinkCustomerUserDialog } from "@/components/link-customer-user-dialog";
import { DataState, Status } from "@/components/nfv-controls";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { recordDetailDrawer } from "@/components/record-detail-drawer";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage, type ClientApiError } from "@/lib/client-error";
import {
  csaCustomerAssignmentHref,
  csaCustomerDetailKey,
  csaCustomerHref,
  csaCustomerListKey,
  csaCustomerPath,
  readCsaCustomerListContext,
} from "@/lib/csa-customers-query";
import type { CSACustomer } from "@/lib/types";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";

const drawerZIndex = getDefaultZIndex("modal") - 1;
const longText = { overflowWrap: "anywhere" } as const;

export function CSACustomerDetail({
  customerId,
  intercepted = false,
}: {
  customerId: string;
  intercepted?: boolean;
}) {
  return <CustomerDetailView key={customerId} customerId={customerId} intercepted={intercepted} />;
}

function CustomerDetailView({
  customerId,
  intercepted,
}: {
  customerId: string;
  intercepted: boolean;
}) {
  const { locale, t } = useAdminI18n();
  const copy = t.csaCustomers;
  const toast = useToast();
  const client = useQueryClient();
  const isQueryScopeCurrent = useIsAdminQueryScopeCurrent();
  const router = useRouter();
  const params = useSearchParams();
  const listContext = readCsaCustomerListContext(params ?? new URLSearchParams());
  const backHref = csaCustomerHref(listContext);
  const mobile = useMediaQuery("(max-width: 47.99em)");
  const drawer = intercepted && !mobile;
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const linkButtonRef = useRef<HTMLButtonElement>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const detailKey = csaCustomerDetailKey(customerId);
  const detail = useQuery<CSACustomer, ClientApiError>({
    queryKey: detailKey,
    queryFn: ({ signal }) =>
      api<CSACustomer>(`admin/csa-customers/${encodeURIComponent(customerId)}`, { signal }),
  });
  const detailUnavailable = Boolean(
    detail.error &&
    (detail.error.status === 401 ||
      detail.error.status === 403 ||
      detail.error.status === 404 ||
      detail.error.message === "forbidden" ||
      detail.error.message === "csrf_rejected"),
  );
  const item = detailUnavailable ? undefined : detail.data;
  const linkDialogActive = linkDialogOpen && item !== undefined && !item.user;
  const { provinceName, wardName } = useAdministrativeUnitNames(
    item?.province_code ?? null,
    item?.ward_code ?? null,
    locale,
  );
  const breadcrumbs = useMemo(
    () => [{ label: copy.title, href: backHref }, { label: item?.name || copy.profile }],
    [backHref, copy.profile, copy.title, item?.name],
  );

  useEffect(() => {
    if (!drawer) headingRef.current?.focus({ preventScroll: !intercepted });
  }, [drawer, intercepted]);
  useEffect(() => {
    if (detailUnavailable) setLinkDialogOpen(false);
  }, [detailUnavailable]);

  function closeDetail() {
    if (!linkDialogActive) router.back();
  }

  const title = item?.name || copy.profile;
  const recovery = detail.error && (
    <RecoveryAlert
      message={requestErrorMessage(detail.error, t)}
      retryLabel={t.common.retry}
      onRetry={() => void detail.refetch({ cancelRefetch: false })}
      loading={detail.isFetching}
    />
  );
  const content = item ? (
    <Stack gap="md">
      {recovery}
      <Paper component="section" p="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={2} size="md" fw={600}>
              {copy.accountInformation}
            </Title>
            {!item.user && (
              <Button ref={linkButtonRef} variant="default" onClick={() => setLinkDialogOpen(true)}>
                {copy.linkUser}
              </Button>
            )}
          </Group>
          <RecordDetailFields>
            <RecordDetailField label={copy.name}>{item.user?.name || item.name}</RecordDetailField>
            <RecordDetailField label="Email">{item.user?.email}</RecordDetailField>
            <RecordDetailField label={copy.phone}>{item.phone}</RecordDetailField>
            <RecordDetailField label={copy.websiteAccount}>
              <Status
                domain="account-link"
                status={item.user ? "linked" : "managed"}
                label={item.user ? copy.linkedAccount : copy.unlinkedAccount}
              />
            </RecordDetailField>
            <RecordDetailField label={copy.province}>{provinceName}</RecordDetailField>
            <RecordDetailField label={copy.ward}>{wardName}</RecordDetailField>
            <RecordDetailField label={copy.deliveryAddress}>{item.address}</RecordDetailField>
          </RecordDetailFields>
        </Stack>
      </Paper>
      <Paper component="section" p="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={2} size="md" fw={600}>
              {copy.membershipHistory}
            </Title>
            <Button
              component={AdminNavigationLink}
              href={csaCustomerAssignmentHref(listContext, item.id)}
            >
              {copy.assignPackage}
            </Button>
          </Group>
          {item.memberships?.length ? (
            <Stack gap="xs">
              {[...item.memberships]
                .sort((left, right) => {
                  const leftDate = Date.parse(left.start_date);
                  const rightDate = Date.parse(right.start_date);
                  return (
                    (Number.isFinite(rightDate) ? rightDate : -Infinity) -
                    (Number.isFinite(leftDate) ? leftDate : -Infinity)
                  );
                })
                .map((membership) => (
                  <CustomerMembershipCard key={membership.id} item={membership} t={t} />
                ))}
            </Stack>
          ) : (
            <DataState kind="empty" title={copy.noHistory} />
          )}
        </Stack>
      </Paper>
    </Stack>
  ) : recovery ? (
    recovery
  ) : (
    <Paper component="section" p="md" aria-busy="true">
      <VisuallyHidden role="status">{copy.detailLoading}</VisuallyHidden>
      <Stack gap="sm" aria-hidden="true">
        <Skeleton height={18} width="45%" />
        <Skeleton height={40} />
        <Skeleton height={40} />
      </Stack>
    </Paper>
  );

  return (
    <>
      <AdminBreadcrumbForRoute
        pathname={`${csaCustomerPath}/${encodeURIComponent(customerId)}`}
        search={params?.toString()}
        items={breadcrumbs}
      />
      {drawer ? (
        <Drawer.Root
          {...recordDetailDrawer.root}
          opened
          onClose={closeDetail}
          zIndex={drawerZIndex}
          returnFocus={false}
          trapFocus={!linkDialogActive}
          closeOnEscape={!linkDialogActive}
          closeOnClickOutside={!linkDialogActive}
        >
          <Drawer.Overlay />
          <Drawer.Content
            inert={linkDialogActive || undefined}
            aria-hidden={linkDialogActive || undefined}
          >
            <Drawer.Header>
              <Drawer.Title style={longText}>{title}</Drawer.Title>
              <Drawer.CloseButton
                {...recordDetailDrawer.closeButton}
                aria-label={t.common.close}
                ref={drawerCloseRef}
                data-autofocus
                disabled={linkDialogActive}
              />
            </Drawer.Header>
            <Drawer.Body>{content}</Drawer.Body>
          </Drawer.Content>
        </Drawer.Root>
      ) : (
        <Stack
          component="article"
          gap="md"
          inert={linkDialogActive || undefined}
          aria-labelledby={headingId}
        >
          <Anchor
            component={AdminNavigationLink}
            href={backHref}
            size="sm"
            w="fit-content"
            onNavigate={(event) => {
              if (intercepted) {
                event.preventDefault();
                closeDetail();
              }
            }}
          >
            <Group component="span" gap={6}>
              <IconArrowLeft size={16} aria-hidden />
              <span>{copy.back}</span>
            </Group>
          </Anchor>
          <Title order={1} id={headingId} ref={headingRef} tabIndex={-1} style={longText}>
            {title}
          </Title>
          {content}
        </Stack>
      )}
      {linkDialogActive && (
        <LinkCustomerUserDialog
          customerId={customerId}
          fallbackFocusRef={drawer ? drawerCloseRef : headingRef}
          returnFocusRef={linkButtonRef}
          onCancel={() => setLinkDialogOpen(false)}
          onLinked={async (customer) => {
            if (!isQueryScopeCurrent()) return;
            // A detail refresh started before the link can still return a managed customer.
            await client.cancelQueries({ queryKey: detailKey, exact: true });
            if (!isQueryScopeCurrent()) return;
            client.setQueryData<CSACustomer>(detailKey, (record) => ({
              ...customer,
              memberships: customer.memberships ?? record?.memberships,
            }));
            void client.invalidateQueries({ queryKey: csaCustomerListKey });
            setLinkDialogOpen(false);
            toast(copy.linkedSuccess);
          }}
        />
      )}
    </>
  );
}
