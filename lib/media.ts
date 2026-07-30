import type { MediaAsset } from "@/lib/types";

export function mediaUrlForWidth(asset: MediaAsset, targetWidth: number): string {
  const variants = [...asset.variants]
    .filter((variant) => variant.width > 0 && variant.url)
    .sort((left, right) => left.width - right.width);
  return (
    variants.find((variant) => variant.width >= targetWidth)?.url ??
    variants.at(-1)?.url ??
    asset.url
  );
}
