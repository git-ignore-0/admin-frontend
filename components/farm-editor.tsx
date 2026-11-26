"use client";
import {
  Alert,
  Box,
  Button,
  Divider,
  Grid,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminImagePicker } from "@/components/admin-image-picker";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { BilingualContentFields } from "@/components/bilingual-content-fields";
import { PageHeading } from "@/components/page-heading";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import type { AdminLocale } from "@/lib/admin-i18n";
import { type ClientApiError, isProtectedDataError, requestErrorMessage } from "@/lib/client-error";
import { farmHref } from "@/lib/farm-navigation";
import { deleteFarmImage, getFarm, saveFarm, uploadFarmImage } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { isSupportedImageFile } from "@/lib/image-validation";
import { mediaUrlForWidth } from "@/lib/media";
import type { Farm, MediaAsset } from "@/lib/types";

type Form = {
  name_en: string;
  name_vi: string;
  location_en: string;
  location_vi: string;
  description_en: string;
  description_vi: string;
  photos: MediaAsset[];
  is_active: boolean;
  version?: number;
};
const emptyForm: Form = {
  name_en: "",
  name_vi: "",
  location_en: "",
  location_vi: "",
  description_en: "",
  description_vi: "",
  photos: [],
  is_active: true,
};
function fromFarm(farm: Farm): Form {
  return {
    name_en: farm.name_en,
    name_vi: farm.name_vi,
    location_en: farm.location_en,
    location_vi: farm.location_vi,
    description_en: farm.description_en,
    description_vi: farm.description_vi,
    photos: farm.photos.length ? farm.photos : farm.image ? [farm.image] : [],
    is_active: farm.is_active,
    version: farm.version,
  };
}

function farmUnavailable(caught: unknown) {
  return isProtectedDataError(caught) || (caught as ClientApiError | null)?.status === 404;
}

function discardTemporaryPhotos(ids: Set<string>) {
  for (const id of ids) void deleteFarmImage(id, { keepalive: true }).catch(() => undefined);
}

export function FarmEditor({ farmId }: { farmId?: string }) {
  return <FarmEditorForm key={farmId ?? "new"} farmId={farmId} />;
}

function FarmEditorForm({ farmId }: { farmId?: string }) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const router = useRouter();
  const search = useSearchParams();
  const { breakpoints } = useMantineTheme();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const listHref = farmHref(search);
  const returnHref = farmHref(search, { id: farmId });
  const routePath = farmHref(null, { id: farmId, mode: farmId ? "edit" : "new" });
  const toast = useToast();
  const [form, setForm] = useState<Form>(emptyForm);
  const [savedNames, setSavedNames] = useState<Record<AdminLocale, string>>();
  const [loading, setLoading] = useState(Boolean(farmId));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [activeLocale, setActiveLocale] = useState<AdminLocale>(locale);
  const [retry, setRetry] = useState(0);
  const translationRef = useRef(t);
  translationRef.current = t;
  const formRef = useRef<HTMLFormElement>(null);
  const pendingFocus = useRef<"name" | "location" | null>(null);
  const temporaryIds = useRef(new Set<string>());
  const mounted = useRef(false);
  const saveLock = useRef(false);
  const uploadLock = useRef(false);

  useLayoutEffect(() => {
    const temp = temporaryIds.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      // The pending save can still attach these uploads.
      if (!saveLock.current) discardTemporaryPhotos(temp);
    };
  }, []);
  useEffect(() => {
    if (!farmId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getFarm(farmId, controller.signal)
      .then((farm) => {
        if (controller.signal.aborted || !isCurrent()) return;
        const retained = new Set([
          ...farm.photos.map((photo) => photo.id),
          ...(farm.image ? [farm.image.id] : []),
        ]);
        for (const id of temporaryIds.current) {
          if (retained.has(id)) {
            temporaryIds.current.delete(id);
          } else {
            void deleteFarmImage(id)
              .then(() => temporaryIds.current.delete(id))
              .catch(() => undefined);
          }
        }
        setForm(fromFarm(farm));
        setSavedNames({ vi: farm.name_vi, en: farm.name_en });
        setConflict(false);
      })
      .catch((caught) => {
        if (controller.signal.aborted || !isCurrent()) return;
        setSavedNames(undefined);
        if (farmUnavailable(caught)) {
          setForm(emptyForm);
          setPhotoError("");
          setConflict(false);
        }
        setError(requestErrorMessage(caught, translationRef.current));
      })
      .finally(() => {
        if (!controller.signal.aborted && isCurrent()) setLoading(false);
      });
    return () => controller.abort();
  }, [farmId, isCurrent, retry]);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const selector =
      pendingFocus.current === "name" ? "[data-bilingual-name]" : "[data-farm-location]";
    formRef.current?.querySelector<HTMLInputElement>(selector)?.focus();
    pendingFocus.current = null;
  }, [activeLocale, error]);

  async function upload(files: File[]) {
    if (!files.length || uploadLock.current || saveLock.current || saving || !isCurrent()) return;
    if (files.some((file) => !isSupportedImageFile(file))) {
      setPhotoError(c.photoInvalid);
      return;
    }
    if (form.photos.length + files.length > 12) {
      setPhotoError(c.photoLimit);
      return;
    }
    setPhotoError("");
    uploadLock.current = true;
    setUploading(true);
    try {
      for (const file of files) {
        try {
          const asset = await uploadFarmImage(file);
          if (!mounted.current || !isCurrent()) {
            void deleteFarmImage(asset.id, { keepalive: true }).catch(() => undefined);
            break;
          }
          temporaryIds.current.add(asset.id);
          setForm((current) => ({ ...current, photos: [...current.photos, asset] }));
        } catch (caught) {
          if (!mounted.current || !isCurrent()) break;
          setPhotoError(requestErrorMessage(caught, translationRef.current));
        }
      }
    } finally {
      uploadLock.current = false;
      if (mounted.current && isCurrent()) setUploading(false);
    }
  }

  function movePhoto(index: number, direction: -1 | 1) {
    setForm((current) => {
      const next = [...current.photos];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, photos: next };
    });
  }
  function setCover(index: number) {
    setForm((current) => {
      const next = [...current.photos];
      const [cover] = next.splice(index, 1);
      next.unshift(cover);
      return { ...current, photos: next };
    });
  }
  function removePhoto(id: string) {
    setForm((current) => ({
      ...current,
      photos: current.photos.filter((photo) => photo.id !== id),
    }));
    if (temporaryIds.current.has(id)) {
      void deleteFarmImage(id)
        .then(() => temporaryIds.current.delete(id))
        .catch((caught) => {
          if (mounted.current && isCurrent()) {
            setPhotoError(requestErrorMessage(caught, translationRef.current));
          }
        });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLock.current || saving || uploadLock.current || conflict || !isCurrent()) return;
    for (const language of ["vi", "en"] as const) {
      const missing = !form[`name_${language}`].trim()
        ? "name"
        : !form[`location_${language}`].trim()
          ? "location"
          : null;
      if (missing) {
        const selector = missing === "name" ? "[data-bilingual-name]" : "[data-farm-location]";
        if (activeLocale === language) {
          formRef.current?.querySelector<HTMLInputElement>(selector)?.focus();
        } else {
          pendingFocus.current = missing;
          setActiveLocale(language);
        }
        setError(c.requiredBilingual);
        return;
      }
    }
    saveLock.current = true;
    setSaving(true);
    setError("");
    let saved = false;
    try {
      const result = await saveFarm(farmId, {
        name_vi: form.name_vi.trim(),
        name_en: form.name_en.trim(),
        location_vi: form.location_vi.trim(),
        location_en: form.location_en.trim(),
        description_vi: form.description_vi,
        description_en: form.description_en,
        is_active: form.is_active,
        photo_ids: form.photos.map((photo) => photo.id),
        ...(farmId ? { version: form.version } : {}),
      });
      saved = true;
      for (const photo of form.photos) temporaryIds.current.delete(photo.id);
      if (!mounted.current || !isCurrent()) {
        discardTemporaryPhotos(temporaryIds.current);
        return;
      }
      toast(locale === "vi" ? "Đã lưu trang trại." : "Farm saved.");
      router.replace(farmHref(search, { id: result.id }));
      router.refresh();
    } catch (caught) {
      const status = (caught as ClientApiError | null)?.status;
      if (!mounted.current || !isCurrent()) {
        if (status && status >= 400 && status < 500 && status !== 408) {
          discardTemporaryPhotos(temporaryIds.current);
        }
        return;
      }
      if (farmId && farmUnavailable(caught)) {
        setSavedNames(undefined);
        setForm(emptyForm);
        setPhotoError("");
      }
      if (status === 409) {
        setConflict(true);
        setError(c.conflict);
      } else setError(requestErrorMessage(caught, translationRef.current));
    } finally {
      saveLock.current = false;
      if (!saved && mounted.current && isCurrent()) setSaving(false);
    }
  }

  const breadcrumbTitle = farmId ? t.breadcrumb.edit : t.breadcrumb.newFarm;
  const recordLabel =
    (!loading &&
      (savedNames?.[locale].trim() || savedNames?.[locale === "vi" ? "en" : "vi"].trim())) ||
    t.breadcrumb.farmDetails;
  const breadcrumbItems = useMemo(
    () => [
      { label: t.common.farmList, href: listHref },
      ...(farmId ? [{ label: recordLabel, href: returnHref }] : []),
      { label: breadcrumbTitle },
    ],
    [t.common.farmList, listHref, farmId, recordLabel, returnHref, breadcrumbTitle],
  );
  const heading = (
    <>
      <AdminBreadcrumbForRoute
        pathname={routePath}
        search={search?.toString() ?? ""}
        items={breadcrumbItems}
      />
      <PageHeading title={farmId ? c.editFarm : breadcrumbTitle} visuallyHiddenTitle />
    </>
  );
  const cancel = (
    <Button
      component={AdminNavigationLink}
      variant="default"
      href={returnHref}
      disabled={saving}
      aria-disabled={saving || undefined}
      tabIndex={saving ? -1 : undefined}
      onClick={(event) => {
        if (saving || saveLock.current) event.preventDefault();
      }}
    >
      {c.cancel}
    </Button>
  );

  if (loading)
    return (
      <>
        {heading}
        <Group role="status" gap="xs">
          <Loader size="sm" />
          <Text size="sm">{c.loading}</Text>
        </Group>
      </>
    );
  if (error && farmId && form.version === undefined)
    return (
      <Stack gap="md">
        {heading}
        <RecoveryAlert
          message={error}
          retryLabel={t.common.retry}
          onRetry={() => setRetry((n) => n + 1)}
        />
        <Group justify="flex-end">{cancel}</Group>
      </Stack>
    );

  return (
    <>
      {heading}
      <Box component="form" maw="72rem" mb="lg" noValidate onSubmit={submit} ref={formRef}>
        <Stack gap="md">
          {error &&
            (conflict ? (
              <RecoveryAlert
                message={error}
                retryLabel={c.reload}
                onRetry={() => setRetry((n) => n + 1)}
                loading={uploading}
              />
            ) : (
              <Alert color="danger" role="alert">
                {error}
              </Alert>
            ))}
          <Grid type="container" breakpoints={breakpoints} align="flex-start" gutter="md">
            <Grid.Col span={{ base: 12, sm: 7 }}>
              <BilingualContentFields
                activeLocale={activeLocale}
                busy={saving}
                completionLabels={{
                  complete: locale === "vi" ? "Đã nhập" : "Complete",
                  incomplete: locale === "vi" ? "Chưa nhập" : "Incomplete",
                }}
                defaultLocale={locale}
                descriptionLabel={c.descriptionField}
                isLocaleComplete={(language) =>
                  Boolean(form[`name_${language}`].trim() && form[`location_${language}`].trim())
                }
                languageLabels={{ vi: "Tiếng Việt", en: "English" }}
                nameLabel={c.nameField}
                onLocaleChange={setActiveLocale}
                renderAfterName={(language) => (
                  <TextInput
                    data-farm-location
                    label={c.location}
                    disabled={saving}
                    maxLength={240}
                    onChange={(event) => {
                      const location = event.currentTarget.value;
                      setForm((current) => ({
                        ...current,
                        [`location_${language}`]: location,
                      }));
                    }}
                    required
                    value={form[`location_${language}`]}
                  />
                )}
                title={c.shared}
                value={{
                  vi: { name: form.name_vi, description: form.description_vi },
                  en: { name: form.name_en, description: form.description_en },
                }}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    name_vi: value.vi.name,
                    name_en: value.en.name,
                    description_vi: value.vi.description,
                    description_en: value.en.description,
                  }))
                }
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 5 }}>
              <Paper p="md" withBorder miw={0}>
                <Stack gap="md">
                  <Stack component="section" gap="xs">
                    <Group gap="xs">
                      <Title order={2}>{c.photos}</Title>
                      <Text component="span" size="sm" c="dimmed">
                        {form.photos.length}/12
                      </Text>
                    </Group>
                    <AdminImagePicker
                      items={form.photos.map((photo, index) => ({
                        id: photo.id,
                        src: mediaUrlForWidth(photo, 160),
                        alt: `${c.photos} ${index + 1}`,
                      }))}
                      maxItems={12}
                      busy={uploading || saving}
                      error={photoError}
                      help={c.photoHint}
                      labels={{
                        choose: c.upload,
                        replace: c.upload,
                        empty: locale === "vi" ? "Chưa có ảnh" : "No images yet",
                        cover: locale === "vi" ? "Ảnh đại diện" : "Cover image",
                        setCover: locale === "vi" ? "Đặt làm đại diện" : "Set as cover",
                        moveEarlier: c.moveEarlier,
                        moveLater: c.moveLater,
                        remove: c.removePhoto,
                        uploading: locale === "vi" ? "Đang tải ảnh…" : "Uploading images…",
                        select: locale === "vi" ? "Chọn ảnh số" : "Select image",
                      }}
                      onChooseFiles={upload}
                      onMove={movePhoto}
                      onSetCover={setCover}
                      onRemove={removePhoto}
                    />
                  </Stack>
                  <Divider />
                  <Select
                    label={c.status}
                    allowDeselect={false}
                    disabled={saving}
                    value={String(form.is_active)}
                    onChange={(selection) =>
                      setForm((current) => ({ ...current, is_active: selection === "true" }))
                    }
                    data={[
                      { value: "true", label: c.active },
                      { value: "false", label: c.inactive },
                    ]}
                  />
                </Stack>
              </Paper>
            </Grid.Col>
          </Grid>
          <Group component="footer" justify="flex-end" gap="xs">
            {cancel}
            <Button type="submit" loading={saving} disabled={saving || uploading || conflict}>
              {saving ? c.saving : farmId ? c.save : c.create}
            </Button>
          </Group>
        </Stack>
      </Box>
    </>
  );
}
