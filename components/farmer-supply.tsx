"use client";

import { Alert, Container, Group, SegmentedControl, Stack, Tabs, Title } from "@mantine/core";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { FarmerSupplyEntry } from "@/components/farmer-supply-entry";
import { FarmerSupplyHistory } from "@/components/farmer-supply-history";
import { ListState } from "@/components/list-state";
import { isProtectedDataError, requestErrorMessage } from "@/lib/client-error";
import { farmerFarm } from "@/lib/farm-supply-request-api";
import { FARM_TOKEN } from "@/lib/farm-supply-request-contract";
import { farmerSupplyCopy } from "@/lib/farmer-supply-copy";

type FarmerScope = {
  revision: number;
  token: string;
  client: QueryClient;
  controller: AbortController;
  onError: (cause: unknown) => void;
};

type Access = FarmerScope | "loading" | "missing" | "invalid";

export function FarmerSupply() {
  const { locale, setLocale } = useAdminI18n();
  const c = farmerSupplyCopy[locale];
  const [access, setAccess] = useState<Access>("loading");

  useEffect(() => {
    let current: FarmerScope | undefined;
    let revision = 0;
    const retire = () => {
      const scope = current;
      current = undefined;
      if (!scope) return;
      scope.controller.abort();
      void scope.client.cancelQueries();
      scope.client.clear();
    };
    const syncFragment = () => {
      const hash = window.location.hash;
      const candidate = hash.startsWith("#token=") ? hash.slice("#token=".length) : "";
      const token = FARM_TOKEN.test(candidate) ? candidate : undefined;
      if (current?.token && current.token === token) return;
      retire();
      if (!token) {
        setAccess(hash ? "invalid" : "missing");
        return;
      }
      const scope: FarmerScope = {
        revision: ++revision,
        token,
        client: new QueryClient({
          defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
        }),
        controller: new AbortController(),
        onError(cause) {
          if (current === scope && isProtectedDataError(cause)) {
            retire();
            setAccess("invalid");
          }
        },
      };
      current = scope;
      setAccess(scope);
    };
    syncFragment();
    window.addEventListener("hashchange", syncFragment);
    return () => {
      window.removeEventListener("hashchange", syncFragment);
      retire();
    };
  }, []);

  return (
    <Container component="main" size="lg" py="md">
      <Stack gap="md">
        <Group justify="flex-end">
          <SegmentedControl
            aria-label={locale === "vi" ? "Ngôn ngữ" : "Language"}
            value={locale}
            onChange={(value) => {
              if (value === "vi" || value === "en") setLocale(value);
            }}
            data={[
              { value: "vi", label: "Tiếng Việt" },
              { value: "en", label: "English" },
            ]}
          />
        </Group>
        {typeof access === "string" ? (
          <>
            <Title order={1} size="h3">
              {c.access}
            </Title>
            {access === "loading" ? (
              <ListState
                empty=""
                error=""
                hasData={false}
                isEmpty={false}
                loading
                loadingLabel={c.loading}
                onRetry={() => undefined}
                retryLabel=""
              />
            ) : (
              <Alert color="warning" role="alert">
                {access === "missing" ? c.missingLink : c.invalidLink}
              </Alert>
            )}
          </>
        ) : (
          <QueryClientProvider client={access.client} key={access.revision}>
            <FarmerScopeContent scope={access} />
          </QueryClientProvider>
        )}
      </Stack>
    </Container>
  );
}

function FarmerScopeContent({ scope }: { scope: FarmerScope }) {
  const { locale, t } = useAdminI18n();
  const c = farmerSupplyCopy[locale];
  const [tab, setTab] = useState<string>("entry");
  const [selected, setSelected] = useState<string | null>(null);
  const farm = useQuery({
    queryKey: ["farm"],
    queryFn: ({ signal }) =>
      farmerFarm(scope.token, signal).catch((cause: unknown) => {
        scope.onError(cause);
        throw cause;
      }),
    staleTime: 30_000,
  });

  return (
    <>
      <Title order={1} size="h3">
        {farm.data ? (locale === "vi" ? farm.data.name_vi : farm.data.name_en) : c.access}
      </Title>
      <ListState
        empty=""
        error={farm.error ? requestErrorMessage(farm.error, t) : ""}
        hasData={Boolean(farm.data)}
        isEmpty={false}
        loading={farm.isFetching}
        loadingLabel={c.loading}
        onRetry={() => void farm.refetch()}
        retryLabel={t.common.retry}
      />
      {farm.data && (
        <Tabs
          value={tab}
          onChange={(value) => {
            if (value) setTab(value);
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="entry">{c.entry}</Tabs.Tab>
            <Tabs.Tab value="history">{c.history}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="entry" pt="md">
            {!farm.data.is_active && <Alert color="warning">{c.inactive}</Alert>}
            <FarmerSupplyEntry
              activeTab={tab === "entry"}
              activeFarm={farm.data.is_active}
              token={scope.token}
              signal={scope.controller.signal}
              onScopeError={scope.onError}
              onFarmInactive={() => void farm.refetch()}
              onViewRequest={(id) => {
                setSelected(id);
                setTab("history");
              }}
            />
          </Tabs.Panel>
          <Tabs.Panel value="history" pt="md">
            <FarmerSupplyHistory
              active={tab === "history"}
              token={scope.token}
              selected={selected}
              onSelect={setSelected}
              onScopeError={scope.onError}
            />
          </Tabs.Panel>
        </Tabs>
      )}
    </>
  );
}
