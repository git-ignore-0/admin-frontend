const supportedImageMimes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isSupportedImageFile(file: Pick<File, "name" | "type">) {
  return (
    supportedImageMimes.has(file.type.toLowerCase()) || /\.(?:jpe?g|png|webp)$/i.test(file.name)
  );
}
