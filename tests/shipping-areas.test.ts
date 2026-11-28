import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

import { api } from "@/lib/client-api";
import { getSupportedShippingAreas, supportedShippingAreasOptions } from "@/lib/shipping-areas";

vi.mock("@/lib/client-api", () => ({ api: vi.fn() }));

afterEach(() => vi.clearAllMocks());

it.each([
  {
    locale: "vi",
    provinces: ["Vùng 10", "Đồng Nai", "Vùng 2", "Duyên Hải"],
    provinceOrder: ["04", "02", "03", "01"],
    wards: [
      "Đặc khu Bạch Long Vĩ",
      "Xã An Phú",
      "Phường Bình 10",
      "Vùng 10",
      "Thị trấn An Bình",
      "Phường Bình 2",
      "Xã Bình Hoà",
      "Vùng 2",
    ],
    wardOrder: ["06", "03", "02", "07", "05", "01", "08", "04"],
  },
  {
    locale: "en",
    provinces: ["Region 10", "Dong Nai", "Region 2", "Duyen Hai"],
    provinceOrder: ["02", "04", "03", "01"],
    wards: [
      "Bach Long Vi Special Administrative Zone",
      "An Phu Commune",
      "Binh 10 Ward",
      "Area 10",
      "An Binh Township",
      "Ward Binh 2",
      "Commune Binh Hoa",
      "Area 2",
    ],
    wardOrder: ["06", "03", "02", "07", "05", "01", "08", "04"],
  },
] as const)(
  "orders supported provinces and wards for $locale and keeps complete labels",
  async ({ locale, provinces, provinceOrder, wards, wardOrder }) => {
    const wardPayload = Object.freeze(
      wards.map((name, index) => ({
        ward_code: String(index + 1).padStart(2, "0"),
        ward_name: name,
        shipping_fee_vnd: "30000",
      })),
    );
    const payload = Object.freeze([
      ...provinces.map((name, index) => ({
        province_code: String(index + 1).padStart(2, "0"),
        province_name: name,
        wards: wardPayload,
      })),
      { province_code: "05", province_name: "An Giang", wards: [] },
    ]);
    vi.mocked(api).mockResolvedValue(payload);

    const supported = await getSupportedShippingAreas(locale);

    expect(supported.map((province) => province.code)).toEqual(provinceOrder);
    expect(supported[0].wards.map((ward) => ward.code)).toEqual(wardOrder);
    expect(supported[0].wards[0]).toEqual({
      code: "06",
      name: wards[5],
      shipping_fee_vnd: "30000",
    });
  },
);

it("uses codes to break collation ties independently of endpoint order", async () => {
  const wards = [
    { ward_code: "30020", ward_name: "Binh Ward", shipping_fee_vnd: "0" },
    { ward_code: "30010", ward_name: "Ward Binh", shipping_fee_vnd: "0" },
  ];
  vi.mocked(api).mockResolvedValue([
    { province_code: "90", province_name: "Hoa", wards },
    { province_code: "10", province_name: "HOA", wards },
  ]);

  const supported = await getSupportedShippingAreas("en");

  expect(supported.map((province) => province.code)).toEqual(["10", "90"]);
  expect(supported[0].wards.map((ward) => ward.code)).toEqual(["30010", "30020"]);
});

it("reuses the same in-flight and fresh shipping area results for the same locale", async () => {
  vi.mocked(api).mockResolvedValue([]);
  const client = new QueryClient();

  try {
    await Promise.all([
      client.fetchQuery(supportedShippingAreasOptions("vi")),
      client.fetchQuery(supportedShippingAreasOptions("vi")),
    ]);
    expect(await client.fetchQuery(supportedShippingAreasOptions("vi"))).toEqual([]);
    expect(await client.fetchQuery(supportedShippingAreasOptions("en"))).toEqual([]);

    expect(api).toHaveBeenCalledTimes(2);
    expect(api).toHaveBeenNthCalledWith(1, "public/shipping-areas?locale=vi", {
      signal: expect.any(AbortSignal),
    });
    expect(api).toHaveBeenNthCalledWith(2, "public/shipping-areas?locale=en", {
      signal: expect.any(AbortSignal),
    });
  } finally {
    client.clear();
  }
});
