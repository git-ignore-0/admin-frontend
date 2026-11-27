import type { Metadata } from "next";

import { FarmerSupply } from "@/components/farmer-supply";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "NFV · Trang trại" },
  description: null,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function FarmerPage() {
  return <FarmerSupply />;
}
