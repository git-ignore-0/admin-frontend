import { renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { AdminQueryProvider } from "@/components/admin-query-provider";
import { getAdministrativeProvinces, getAdministrativeWards } from "@/lib/administrative-units";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";

vi.mock("@/lib/administrative-units", async (original) => ({
  ...(await original<typeof import("@/lib/administrative-units")>()),
  getAdministrativeProvinces: vi.fn(),
  getAdministrativeWards: vi.fn(),
}));

it("shares public units across consumers and requests a new ward list only for a new parent", async () => {
  vi.mocked(getAdministrativeProvinces).mockResolvedValue([
    { code: "79", name: "City" },
    { code: "66", name: "Province" },
  ]);
  vi.mocked(getAdministrativeWards).mockResolvedValue([{ code: "01", name: "Ward" }]);
  const { result, rerender } = renderHook(
    ({ parent }) => [
      useAdministrativeUnitNames("79", "01", "en"),
      useAdministrativeUnitNames(parent, "01", "en"),
    ],
    { wrapper: AdminQueryProvider, initialProps: { parent: "79" } },
  );
  await waitFor(() =>
    expect(result.current[1]).toEqual({ provinceName: "City", wardName: "Ward" }),
  );
  expect(getAdministrativeProvinces).toHaveBeenCalledTimes(1);
  expect(getAdministrativeWards).toHaveBeenCalledTimes(1);
  rerender({ parent: "66" });
  await waitFor(() =>
    expect(result.current[1]).toEqual({ provinceName: "Province", wardName: "Ward" }),
  );
  expect(getAdministrativeProvinces).toHaveBeenCalledTimes(1);
  expect(getAdministrativeWards).toHaveBeenCalledTimes(2);
});
