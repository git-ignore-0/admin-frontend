import { useEffect, useState } from "react";

import {
  administrativeUnitName,
  getAdministrativeProvinces,
  getAdministrativeWards,
} from "@/lib/administrative-units";

export function useAdministrativeUnitNames(
  provinceCode: string | null,
  wardCode: string | null,
  locale: "vi" | "en",
) {
  const [provinceName, setProvinceName] = useState<string | null>(null);
  const [wardName, setWardName] = useState<string | null>(null);

  useEffect(() => {
    setProvinceName(null);
    if (!provinceCode) return;

    const controller = new AbortController();
    getAdministrativeProvinces(locale, controller.signal)
      .then((units) => {
        if (!controller.signal.aborted && Array.isArray(units)) {
          setProvinceName(administrativeUnitName(units, provinceCode));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setProvinceName(null);
      });
    return () => controller.abort();
  }, [locale, provinceCode]);

  useEffect(() => {
    setWardName(null);
    if (!provinceCode || !wardCode) return;

    const controller = new AbortController();
    getAdministrativeWards(provinceCode, locale, controller.signal)
      .then((units) => {
        if (!controller.signal.aborted && Array.isArray(units)) {
          setWardName(administrativeUnitName(units, wardCode));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setWardName(null);
      });
    return () => controller.abort();
  }, [locale, provinceCode, wardCode]);

  return { provinceName, wardName };
}
