"use client";

import {
  Alert,
  Anchor,
  Button,
  Code,
  Divider,
  Drawer,
  getDefaultZIndex,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconArrowLeft } from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type MouseEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { DataState, Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { recordDetailDrawer } from "@/components/record-detail-drawer";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import { UserAccountDialog, type UserAccountDialogAction } from "@/components/user-account-dialog";
import { UserEmail } from "@/components/user-email";
import { formatAdminDateTime } from "@/lib/admin-date";
import { accountFailure, requireAccountActionResult, userEmailStatus } from "@/lib/admin-users";
import {
  adminUsersListHref,
  useAdminUserDetail,
  useAdminUsersMutationAccess,
  useRefreshAdminUsers,
} from "@/lib/admin-users-query";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type {
  AdminAccountSummary,
  AdminUserDetail,
  InvitedAdminUser,
  PaginationMeta,
} from "@/lib/types";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";

const drawerZIndex = getDefaultZIndex("modal") - 1;
const longText = { overflowWrap: "anywhere" } as const;
type UserDetailSummary = Omit<AdminUserDetail, "invited_users">;

function statusActionFor(status: string) {
  switch (status) {
    case "pending_activation":
      return "activate";
    case "active":
      return "suspend";
    case "suspended":
      return "reactivate";
    default:
      return null;
  }
}

export function UserDetail({
  userId,
  intercepted = false,
}: {
  userId: string;
  intercepted?: boolean;
}) {
  return <UserDetailView key={userId} userId={userId} intercepted={intercepted} />;
}

function UserDetailView({ userId, intercepted }: { userId: string; intercepted: boolean }) {
  const { locale, t } = useAdminI18n();
  const isScopeCurrent = useIsAdminQueryScopeCurrent();
  const { canMutate, captureMutationAccess } = useAdminUsersMutationAccess();
  const refreshUsers = useRefreshAdminUsers();
  const router = useRouter();
  const params = useSearchParams();
  const backHref = adminUsersListHref(params);
  const breadcrumbs = useMemo(
    () => [{ label: t.common.users, href: backHref }, { label: t.users.detailTitle }],
    [backHref, t.common.users, t.users.detailTitle],
  );
  const mobile = useMediaQuery("(max-width: 47.99em)");
  const drawer = intercepted && !mobile;
  const toast = useToast();
  const copy = t.users.accountActions;
  const headingId = useId();
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const drawerClose = useRef<HTMLButtonElement>(null);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const pendingSubmission = useRef<symbol | null>(null);
  const [invitedPage, setInvitedPage] = useState(1);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{
    action: UserAccountDialogAction;
    accessRevision: number;
  } | null>(null);
  const [focusAction, setFocusAction] = useState<UserAccountDialogAction | null>(null);
  const query = useAdminUserDetail(userId, invitedPage);
  const user = query.summary?.data;
  const exactPage = query.data;
  const referralPageMissing = Boolean(user && !exactPage);
  const statusAction = user ? statusActionFor(user.status) : null;
  const canReset = Boolean(user && statusAction && !user.email_verified);
  const activeDialog =
    canMutate &&
    dialog?.accessRevision === query.accessRevision &&
    ((dialog.action === "suspend" && statusAction === "suspend") ||
      (dialog.action === "reset-password" && canReset))
      ? dialog.action
      : null;
  const readPending = query.isFetching || query.waitingForConnection;
  const readUnavailable = !exactPage || readPending || Boolean(query.error);
  const navigationBlocked = busy || activeDialog !== null;

  useLayoutEffect(() => {
    return () => {
      pendingSubmission.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (!drawer) pageHeading.current?.focus({ preventScroll: !intercepted });
  }, [drawer, intercepted]);

  useLayoutEffect(() => {
    if (dialog && !activeDialog) setDialog(null);
    if (query.accessDenied) {
      pendingSubmission.current = null;
      setBusy(false);
      setActionError("");
      setFocusAction(null);
    }
  }, [activeDialog, dialog, query.accessDenied]);

  function closeDetail() {
    if (!navigationBlocked && !pendingSubmission.current) router.back();
  }

  function handleStateConflict(message: string) {
    setDialog(null);
    setActionError(message);
    return refreshUsers(userId);
  }

  async function changeStatus(action: "activate" | "reactivate") {
    if (
      pendingSubmission.current ||
      navigationBlocked ||
      readUnavailable ||
      action !== statusActionFor(exactPage?.data.status ?? "")
    ) {
      return;
    }
    const isAccessCurrent = captureMutationAccess();
    if (!isAccessCurrent) return;
    const submission = Symbol();
    const isCurrent = () => pendingSubmission.current === submission && isAccessCurrent();
    pendingSubmission.current = submission;
    setBusy(true);
    setActionError("");
    try {
      const result = await api<Pick<AdminAccountSummary, "id" | "status">>(
        `admin/users/${encodeURIComponent(userId)}/${action}`,
        { method: "POST", headers: { "Accept-Language": locale }, body: "{}" },
        { shouldRedirectToLogin: isCurrent },
      );
      if (!isCurrent()) return;
      requireAccountActionResult(result, action, userId);
      toast(copy.success);
      await refreshUsers(userId);
    } catch (caught) {
      if (!isCurrent()) return;
      const failure = accountFailure(caught, t, locale);
      if (failure.stateConflict) await handleStateConflict(failure.message);
      else setActionError(failure.message || copy.invalid);
      if (failure.recheckAccess) await refreshUsers(userId);
    } finally {
      if (pendingSubmission.current === submission && isScopeCurrent()) {
        pendingSubmission.current = null;
        setBusy(false);
      }
    }
  }

  function openDialog(action: UserAccountDialogAction, event: MouseEvent<HTMLButtonElement>) {
    const target = exactPage?.data;
    if (
      !target ||
      readUnavailable ||
      navigationBlocked ||
      pendingSubmission.current ||
      (action === "suspend"
        ? target.status !== "active"
        : !statusActionFor(target.status) || target.email_verified) ||
      !captureMutationAccess()
    ) {
      return;
    }
    dialogTrigger.current = event.currentTarget;
    setActionError("");
    setFocusAction(action);
    setDialog({ action, accessRevision: query.accessRevision });
  }

  const loadError = query.accessDenied
    ? t.common.forbidden
    : query.error
      ? requestErrorMessage(query.error, t)
      : query.waitingForConnection
        ? t.users.offline
        : "";
  function retryRead() {
    void query.refetch({ cancelRefetch: false });
  }

  const title = user?.name || t.users.detailTitle;
  const content = (
    <Stack gap="md" aria-busy={(query.isFetching && !referralPageMissing) || undefined}>
      {loadError && !referralPageMissing && (
        <RecoveryAlert
          message={loadError}
          retryLabel={t.common.retry}
          loading={query.isFetching && !user}
          onRetry={retryRead}
        />
      )}
      {!user && query.isPending && !loadError && (
        <DataState kind="loading" title={t.users.loading} />
      )}
      {user && (
        <>
          {actionError && (
            <Alert color="danger" role="alert">
              {actionError}
            </Alert>
          )}
          <UserDetails user={user} navigationBlocked={navigationBlocked}>
            <UserReferrals
              count={user.invited_count}
              invitees={exactPage?.data.invited_users}
              meta={exactPage ? exactPage.meta?.invited : query.summary?.meta?.invited}
              page={exactPage?.meta?.invited?.page ?? invitedPage}
              loading={referralPageMissing && query.isFetching}
              error={referralPageMissing ? loadError : ""}
              paginationDisabled={navigationBlocked || readPending}
              onRetry={retryRead}
              onPage={setInvitedPage}
            />
          </UserDetails>
        </>
      )}
    </Stack>
  );
  const buttonsDisabled = !canMutate || readUnavailable || navigationBlocked;
  // Mantine restarts the Drawer focus trap when the nested dialog closes.
  const focusSuspend = !buttonsDisabled && focusAction === "suspend" && statusAction === "suspend";
  const focusReset = !buttonsDisabled && focusAction === "reset-password" && canReset;
  const actions = statusAction && (
    <Group component="footer" {...recordDetailDrawer.footer} aria-label={copy.title}>
      {statusAction === "suspend" && (
        <Button
          color="danger"
          variant="subtle"
          data-autofocus={focusSuspend || undefined}
          disabled={buttonsDisabled}
          onClick={(event) => openDialog("suspend", event)}
        >
          {copy.suspend}
        </Button>
      )}
      {(canReset || statusAction !== "suspend") && (
        <Group gap="xs" justify="flex-end" ms="auto" maw="100%">
          {canReset && (
            <Button
              variant="default"
              data-autofocus={focusReset || undefined}
              disabled={buttonsDisabled}
              onClick={(event) => openDialog("reset-password", event)}
            >
              {copy["reset-password"]}
            </Button>
          )}
          {statusAction !== "suspend" && (
            <Button
              variant="filled"
              loading={busy}
              disabled={buttonsDisabled}
              onClick={() => void changeStatus(statusAction)}
            >
              {copy[statusAction]}
            </Button>
          )}
        </Group>
      )}
    </Group>
  );

  return (
    <>
      <AdminBreadcrumbForRoute
        pathname={`/users/${encodeURIComponent(userId)}`}
        search={params.toString()}
        items={breadcrumbs}
      />
      {drawer ? (
        <Drawer.Root
          {...recordDetailDrawer.root}
          opened
          onClose={closeDetail}
          zIndex={drawerZIndex}
          returnFocus={false}
          trapFocus={!activeDialog}
          closeOnEscape={!navigationBlocked}
          closeOnClickOutside={!navigationBlocked}
        >
          <Drawer.Overlay />
          <Drawer.Content
            inert={activeDialog !== null || undefined}
            aria-hidden={activeDialog ? true : undefined}
          >
            <Drawer.Header>
              <UserDetailIdentity title={<Drawer.Title>{title}</Drawer.Title>} user={user} />
              <Drawer.CloseButton
                {...recordDetailDrawer.closeButton}
                aria-label={t.common.close}
                ref={drawerClose}
                data-autofocus={(!focusSuspend && !focusReset) || undefined}
                disabled={navigationBlocked}
              />
            </Drawer.Header>
            <Drawer.Body>{content}</Drawer.Body>
            {actions}
          </Drawer.Content>
        </Drawer.Root>
      ) : (
        <Stack
          component="article"
          gap="md"
          bg="var(--background)"
          inert={activeDialog !== null || undefined}
          aria-labelledby={headingId}
        >
          <Anchor
            component={AdminNavigationLink}
            href={backHref}
            size="sm"
            w="fit-content"
            aria-disabled={navigationBlocked || undefined}
            onClick={(event) => {
              if (navigationBlocked || pendingSubmission.current) event.preventDefault();
            }}
            onNavigate={(event) => {
              if (intercepted || navigationBlocked || pendingSubmission.current) {
                event.preventDefault();
                if (intercepted) closeDetail();
              }
            }}
          >
            <Group component="span" gap={6}>
              <IconArrowLeft size={16} aria-hidden />
              <span>{t.users.backLabel}</span>
            </Group>
          </Anchor>
          <UserDetailIdentity
            title={
              <Title order={1} id={headingId} ref={pageHeading} tabIndex={-1} style={longText}>
                {title}
              </Title>
            }
            user={user}
          />
          {content}
          {actions}
        </Stack>
      )}
      {activeDialog && (
        <UserAccountDialog
          action={activeDialog}
          userId={userId}
          confirmDisabled={!canMutate || readUnavailable}
          returnFocusRef={dialogTrigger}
          fallbackFocusRef={drawer ? drawerClose : pageHeading}
          onCancel={() => setDialog(null)}
          onStateConflict={(message) => void handleStateConflict(message)}
          onSuccess={() => {
            setDialog(null);
            void refreshUsers(userId);
          }}
        />
      )}
    </>
  );
}

function UserStatus({ status }: { status: string }) {
  const { t } = useAdminI18n();
  const label = Object.hasOwn(t.users.statuses, status)
    ? t.users.statuses[status as keyof typeof t.users.statuses]
    : status;
  return <Status domain="user" status={status} label={label} />;
}

function UserDetailIdentity({ title, user }: { title: ReactNode; user?: UserDetailSummary }) {
  return (
    <Stack {...recordDetailDrawer.identity}>
      <Group align="baseline" gap="xs">
        {title}
        {user && <UserStatus status={user.status} />}
      </Group>
      {user && <UserEmail user={user} />}
    </Stack>
  );
}

function UserDetailSection({
  title,
  fields,
  children,
}: {
  title: string;
  fields: Array<[string, ReactNode]>;
  children?: ReactNode;
}) {
  return (
    <Paper component="section" p="md">
      <Stack gap="sm">
        <Title order={2} size="md" fw={600}>
          {title}
        </Title>
        <SimpleGrid
          component="dl"
          type="container"
          cols={{ base: 1, "26rem": 2 }}
          spacing="sm"
          m={0}
        >
          {fields.map(([label, value]) => (
            <Stack key={label} gap={4} miw={0}>
              <Text component="dt" size="sm" c="dimmed">
                {label}
              </Text>
              <Text component="dd" m={0} c={value == null ? "dimmed" : undefined} style={longText}>
                {value ?? "—"}
              </Text>
            </Stack>
          ))}
        </SimpleGrid>
        {children}
      </Stack>
    </Paper>
  );
}

function UserContactDetails({ user }: { user: UserDetailSummary }) {
  const { locale, t } = useAdminI18n();
  const { provinceName, wardName } = useAdministrativeUnitNames(
    user.province_code || null,
    user.ward_code || null,
    locale,
  );
  const fields: Array<[string, ReactNode]> = [
    [t.users.phone, user.phone || null],
    [t.csaCustomers.address, user.address || null],
  ];
  if (user.province_code)
    fields.push([t.csaCustomers.province, provinceName || user.province_code]);
  if (user.ward_code) fields.push([t.csaCustomers.ward, wardName || user.ward_code]);

  return <UserDetailSection title={t.users.contactDetails} fields={fields} />;
}

function UserDetails({
  user,
  navigationBlocked,
  children,
}: {
  user: UserDetailSummary;
  navigationBlocked: boolean;
  children: ReactNode;
}) {
  const { locale, t } = useAdminI18n();
  function guardPointsNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (navigationBlocked) event.preventDefault();
  }

  return (
    <>
      <UserDetailSection
        title={t.users.details}
        fields={[
          [t.users.loginPhone, user.login_phone_number || null],
          [t.users.emailStatus, userEmailStatus(user, t)],
          [t.users.created, formatAdminDateTime(user.date_joined)],
          [t.users.csaProfile, user.has_csa_customer ? t.users.csaPresent : t.users.csaAbsent],
        ]}
      >
        {statusActionFor(user.status) && user.email_verified && (
          <Alert color="info">{t.users.accountActions.emailRecovery}</Alert>
        )}
      </UserDetailSection>
      <UserContactDetails key={`${locale}:${user.province_code}:${user.ward_code}`} user={user} />
      <UserDetailSection title={t.common.points} fields={[[t.users.balance, user.points_balance]]}>
        <Group gap="sm">
          <Anchor
            component={AdminNavigationLink}
            href={`/points/${encodeURIComponent(user.id)}`}
            aria-disabled={navigationBlocked || undefined}
            onClick={guardPointsNavigation}
          >
            {t.common.managePoints}
          </Anchor>
          <Anchor
            component={AdminNavigationLink}
            href="/points"
            aria-disabled={navigationBlocked || undefined}
            onClick={guardPointsNavigation}
          >
            {t.users.pointsDirectory}
          </Anchor>
        </Group>
      </UserDetailSection>
      <UserDetailSection
        title={t.users.referralDetails}
        fields={[
          [t.users.referralCode, user.referral_code ? <Code>{user.referral_code}</Code> : null],
          [t.users.source, user.source === "referred" ? t.users.referralSignup : t.users.organic],
          [t.users.referrer, user.referrer?.name || null],
        ]}
      >
        <Divider />
        {children}
      </UserDetailSection>
    </>
  );
}

function UserReferrals({
  count,
  invitees,
  meta,
  page,
  loading,
  error,
  paginationDisabled,
  onRetry,
  onPage,
}: {
  count: number;
  invitees?: InvitedAdminUser[];
  meta?: PaginationMeta;
  page: number;
  loading: boolean;
  error: string;
  paginationDisabled: boolean;
  onRetry: () => void;
  onPage: (page: number) => void;
}) {
  const { t } = useAdminI18n();
  const headingId = useId();
  return (
    <Stack component="section" gap="sm" aria-labelledby={headingId}>
      <Title order={3} size="sm" fw={600} id={headingId}>
        {t.users.invited.replace("{count}", String(count))}
      </Title>
      {loading && <DataState kind="loading" title={t.users.invitedLoading} compact />}
      {!loading && error && (
        <RecoveryAlert message={error} retryLabel={t.common.retry} onRetry={onRetry} />
      )}
      {invitees &&
        (invitees.length === 0 ? (
          <DataState kind="empty" title={t.users.invitedEmpty} compact />
        ) : (
          <Stack component="ul" p={0} m={0} gap="xs" style={{ listStyle: "none" }}>
            {invitees.map((invitee) => (
              <Group
                key={invitee.id}
                component="li"
                justify="space-between"
                align="flex-start"
                gap="xs"
              >
                <Stack gap={4} miw={0}>
                  <Text fw={600} style={longText}>
                    {invitee.name}
                  </Text>
                  <Text size="sm" c="dimmed" style={longText}>
                    {invitee.email || t.users.emailMissing}
                  </Text>
                  {invitee.referred_at && (
                    <Text size="sm" c="dimmed">
                      {formatAdminDateTime(invitee.referred_at)}
                    </Text>
                  )}
                </Stack>
                <UserStatus status={invitee.status} />
              </Group>
            ))}
          </Stack>
        ))}
      {meta && (
        <Pagination
          disabled={paginationDisabled}
          page={page}
          total={meta.total}
          pageSize={meta.page_size}
          onPage={onPage}
          previousLabel={t.common.previous}
          nextLabel={t.common.next}
          summary={t.common.pagination}
        />
      )}
    </Stack>
  );
}
