"use client";
import {
  Alert,
  Anchor,
  Box,
  Button,
  Divider,
  Grid,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type FormEvent,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminImagePicker } from "@/components/admin-image-picker";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { BilingualContentFields } from "@/components/bilingual-content-fields";
import { FarmTrackerFields, useFarmTracker } from "@/components/farm-tracker-profile-editor";
import { PageHeading } from "@/components/page-heading";
import { PhoneInput } from "@/components/phone-input";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import type { AdminLocale } from "@/lib/admin-i18n";
import {
  apiErrorFields,
  type ClientApiError,
  invalidApiResponse,
  requestErrorMessage,
} from "@/lib/client-error";
import { captureFarmDetail, publishFarmDetail } from "@/lib/farm-detail-snapshot";
import { farmHref } from "@/lib/farm-navigation";
import {
  farmAccess,
  farmAccessDenied,
  farmDetailKey,
  farmListKey,
  farmNotFound,
  isFarmGone,
  retireFarmAccess,
  retryFarmAccess,
  useFarmAccess,
} from "@/lib/farm-query";
import { deleteFarmImage, getFarm, saveFarm, uploadFarmImage } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { isSupportedImageFile } from "@/lib/image-validation";
import { mediaUrlForWidth } from "@/lib/media";
import {
  formatVietnamPhone,
  isEditablePhoneValid,
  normalizeEditablePhone,
  normalizeVietnamPhone,
  type EditablePhone,
} from "@/lib/phone-number";
import type { Farm, MediaAsset } from "@/lib/types";

type Form = {
  name_en: string;
  name_vi: string;
  location_en: string;
  location_vi: string;
  contact_phone: EditablePhone;
  description_en: string;
  description_vi: string;
  photos: MediaAsset[];
};
type SaveRecovery =
  | { kind: "create"; search: string }
  | {
      kind: "edit";
      version: number;
      latest?: Farm;
      stale?: boolean;
      problem?: unknown;
      conflict?: boolean;
    };
type UploadedPhotos = Map<string, "temporary" | "submitted">;
type AlbumChoice = "server" | "local";

const emptyForm: Form = {
  name_en: "",
  name_vi: "",
  location_en: "",
  location_vi: "",
  contact_phone: { value: "", entry: "ready" },
  description_en: "",
  description_vi: "",
  photos: [],
};
function fromFarm(farm: Farm): Form {
  return {
    name_en: farm.name_en,
    name_vi: farm.name_vi,
    location_en: farm.location_en,
    location_vi: farm.location_vi,
    contact_phone: { value: farm.contact_phone, entry: "ready", untouched: true },
    description_en: farm.description_en,
    description_vi: farm.description_vi,
    photos: farm.photos.length ? farm.photos : farm.image ? [farm.image] : [],
  };
}

function farmSaveRejected(problem: ClientApiError | null) {
  return (
    problem?.message === "csrf_rejected" ||
    (problem?.status === 400 &&
      ["validation_error", "invalid_request_body"].includes(problem.message)) ||
    (problem?.status === 409 &&
      ["version_conflict", "farm_product_changed", "stock_reserved"].includes(problem.message))
  );
}

function forgetReferencedPhotos(uploads: UploadedPhotos, farm: Farm) {
  for (const photo of farm.photos) uploads.delete(photo.id.toLowerCase());
  if (farm.image) uploads.delete(farm.image.id.toLowerCase());
}

function discardTemporaryPhotos(uploads: UploadedPhotos, retained: MediaAsset[] = []) {
  const retainedIds = new Set(retained.map((photo) => photo.id.toLowerCase()));
  for (const [id, state] of uploads) {
    if (state === "temporary" && !retainedIds.has(id)) {
      uploads.delete(id);
      void deleteFarmImage(id, { keepalive: true }).catch(() => undefined);
    }
  }
}

const textFields = [
  "name_vi",
  "name_en",
  "location_vi",
  "location_en",
  "description_vi",
  "description_en",
] as const;

function comparablePhone(value: string) {
  // Compare stored phone representations independently of editable mobile validation.
  const displayed = formatVietnamPhone(value) ?? "";
  return normalizeVietnamPhone(displayed) ?? value;
}

function farmInformation(form: Form) {
  const { contact_phone, photos, ...texts } = form;
  for (const field of textFields) texts[field] = texts[field].trim();
  return {
    ...texts,
    contact_phone: contact_phone.untouched
      ? comparablePhone(contact_phone.value)
      : (normalizeEditablePhone(contact_phone) ?? contact_phone.value),
    photo_ids: photoIds(photos),
  };
}

function photoIds(photos: MediaAsset[]) {
  return photos.map((photo) => photo.id);
}

function samePhotoOrder(previous: string[], current: string[]) {
  return (
    previous.length === current.length &&
    current.every((id, index) => id.toLowerCase() === previous[index].toLowerCase())
  );
}

function albumChanges(baseline: string[], latest: string[]) {
  const before = baseline.map((id) => id.toLowerCase());
  const after = latest.map((id) => id.toLowerCase());
  const beforeIds = new Set(before);
  const afterIds = new Set(after);
  return {
    albumAdded: after.some((id) => !beforeIds.has(id)),
    albumRemoved: before.some((id) => !afterIds.has(id)),
    albumReordered: !samePhotoOrder(
      before.filter((id) => afterIds.has(id)),
      after.filter((id) => beforeIds.has(id)),
    ),
    albumCoverChanged: before[0] !== after[0],
  };
}

function albumItems(photos: MediaAsset[], label: string) {
  return photos.map((photo, index) => ({
    id: photo.id,
    src: mediaUrlForWidth(photo, 160),
    alt: `${label} ${index + 1}`,
  }));
}

function changedFarmInformation(baseline: Form, draft: Form) {
  const previous = farmInformation(baseline);
  const current = farmInformation(draft);
  const patch: Partial<typeof current> = {};
  for (const field of textFields) {
    if (previous[field] !== current[field]) patch[field] = current[field];
  }
  if (previous.contact_phone !== current.contact_phone) {
    patch.contact_phone = current.contact_phone;
  }
  if (!samePhotoOrder(previous.photo_ids, current.photo_ids)) {
    patch.photo_ids = current.photo_ids;
  }
  return patch;
}

export function sameFarmInformation(a: Farm, b: Farm) {
  return Object.keys(changedFarmInformation(fromFarm(a), fromFarm(b))).length === 0;
}

function keepFarmEdits(
  delta: ReturnType<typeof changedFarmInformation>,
  latest: Farm,
  draft: Form,
  album: AlbumChoice,
  serverPhoneChanged: boolean,
) {
  const next = fromFarm(latest);
  for (const field of textFields) {
    if (delta[field] !== undefined) next[field] = draft[field];
  }
  // A concurrent phone change requires a fresh edit from the reviewed baseline.
  if (delta.contact_phone !== undefined && !serverPhoneChanged) {
    next.contact_phone = draft.contact_phone;
  }
  if (album === "local") next.photos = draft.photos;
  return next;
}

export type FarmInformationHandle = { syncTracker: () => Promise<boolean> };

type InformationProps = {
  farm: Farm;
  active: boolean;
  headerLocked: boolean;
  ownToggle?: { from: number; to: number };
  claimWrite: () => (() => void) | undefined;
  setInformationLocked: (locked: boolean) => void;
  onAccessLost: (cause: unknown) => void;
  ref?: Ref<FarmInformationHandle>;
};

export function FarmEditor() {
  const access = useFarmAccess();
  return <FarmEditorForm key={access.revision} accessRevision={access.revision} />;
}

export function FarmInformation(props: InformationProps) {
  const access = useFarmAccess();
  return (
    <FarmEditorForm
      key={`${props.farm.id}:${access.revision}`}
      accessRevision={access.revision}
      information={props}
    />
  );
}

function FarmEditorForm({
  information,
  accessRevision,
}: {
  information?: InformationProps;
  accessRevision: number;
}) {
  const farm = information?.farm;
  const farmId = farm?.id;
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const router = useRouter();
  const queryClient = useQueryClient();
  const access = useFarmAccess();
  const search = useSearchParams();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const listHref = farmHref(search);
  const toast = useToast();
  const { breakpoints } = useMantineTheme();
  const [form, setForm] = useState<Form>(() => (farm ? fromFarm(farm) : emptyForm));
  const [baseline, setBaseline] = useState(farm);
  const [initialActive, setInitialActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [phoneServerError, setPhoneServerError] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [recovery, setRecovery] = useState<SaveRecovery | null>(null);
  const [checkingLatest, setCheckingLatest] = useState(false);
  const [activeLocale, setActiveLocale] = useState<AdminLocale>(locale);
  const translationRef = useRef(t);
  translationRef.current = t;
  const formRef = useRef<HTMLFormElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<"name" | "location" | null>(null);
  const uploadsRef = useRef<UploadedPhotos>(new Map());
  const recoveryRequest = useRef<AbortController | null>(null);
  const accessRevoked = useRef(false);
  const mounted = useRef(false);
  const saveLock = useRef(false);
  const uploadLock = useRef(false);
  const onAccessLost = information?.onAccessLost;

  const canAct = useCallback(
    () =>
      mounted.current &&
      isCurrent() &&
      !accessRevoked.current &&
      (!farmId || !isFarmGone(queryClient, farmId)) &&
      farmAccess(queryClient).revision === accessRevision,
    [accessRevision, farmId, isCurrent, queryClient],
  );

  const hideFarm = useCallback(
    (cause: unknown) => {
      if (!isCurrent()) return;
      if (farmAccessDenied(cause)) retireFarmAccess(queryClient, cause);
      if (!mounted.current) return;
      accessRevoked.current = true;
      if (farmId) onAccessLost?.(cause);
      setForm(emptyForm);
      setPhoneServerError(false);
      setPhotoError("");
      setError(requestErrorMessage(cause, translationRef.current));
    },
    [farmId, isCurrent, onAccessLost, queryClient],
  );

  const tracker = useFarmTracker({
    farmId,
    enabled: Boolean(information?.active && !information.headerLocked),
    canAct,
    onAccessLost: hideFarm,
  });
  const { busy: trackerBusy, syncAfterFarmWrite } = tracker;
  useImperativeHandle(information?.ref, () => ({ syncTracker: syncAfterFarmWrite }), [
    syncAfterFarmWrite,
  ]);
  const setInformationLocked = information?.setInformationLocked;
  const blocksHeader = trackerBusy || tracker.needsWriteRecovery || uploading || recovery !== null;
  useLayoutEffect(() => {
    setInformationLocked?.(blocksHeader);
    return () => setInformationLocked?.(false);
  }, [blocksHeader, setInformationLocked]);

  const baselineForm = baseline ? fromFarm(baseline) : null;
  const delta = baselineForm ? changedFarmInformation(baselineForm, form) : {};
  const reviewedForm =
    recovery?.kind === "edit" && recovery.latest ? fromFarm(recovery.latest) : null;
  const serverPhoneChanged = Boolean(
    baselineForm &&
    reviewedForm &&
    comparablePhone(baselineForm.contact_phone.value) !==
      comparablePhone(reviewedForm.contact_phone.value),
  );
  const phone = form.contact_phone.untouched
    ? { ...form.contact_phone, value: formatVietnamPhone(form.contact_phone.value) ?? "" }
    : form.contact_phone;
  const invalidPhone =
    !(phone.untouched && phone.entry === "ready") && !isEditablePhoneValid(phone);
  const baselinePhotoIds = baselineForm && reviewedForm ? photoIds(baselineForm.photos) : null;
  const latestPhotoIds = reviewedForm ? photoIds(reviewedForm.photos) : null;
  const serverAlbumChanges =
    baselinePhotoIds && latestPhotoIds && !samePhotoOrder(baselinePhotoIds, latestPhotoIds)
      ? albumChanges(baselinePhotoIds, latestPhotoIds)
      : null;
  const albumConflict =
    serverAlbumChanges &&
    delta.photo_ids &&
    latestPhotoIds &&
    !samePhotoOrder(delta.photo_ids, latestPhotoIds);
  const imagePickerLabels = {
    choose: c.upload,
    replace: c.upload,
    empty: locale === "vi" ? "Chưa có ảnh" : "No images yet",
    cover: locale === "vi" ? "Ảnh đại diện" : "Cover image",
    setCover: locale === "vi" ? "Đặt làm đại diện" : "Set as cover",
    moveEarlier: c.moveEarlier,
    moveLater: c.moveLater,
    remove: c.removePhoto,
    select: locale === "vi" ? "Chọn ảnh số" : "Select image",
  };
  const farmDirty = Object.keys(delta).length > 0;
  const dirty = farmDirty || tracker.dirty;
  const valid = (["vi", "en"] as const).every(
    (language) => form[`name_${language}`].trim() && form[`location_${language}`].trim(),
  );
  const farmSnapshotChanged = Boolean(
    farm &&
    baseline &&
    (farm.version !== baseline.version ||
      farm.is_active !== baseline.is_active ||
      !sameFarmInformation(farm, baseline)),
  );
  const toggle = information?.ownToggle;

  useEffect(() => {
    if (
      !farm ||
      !baseline ||
      !farmSnapshotChanged ||
      recovery ||
      information?.headerLocked ||
      trackerBusy ||
      saveLock.current ||
      uploadLock.current
    )
      return;
    if (
      toggle?.from === baseline.version &&
      toggle.to === farm.version &&
      sameFarmInformation(farm, baseline)
    ) {
      setBaseline(farm);
    } else if (!dirty && farm.version > baseline.version) {
      setForm(fromFarm(farm));
      setPhoneServerError(false);
      setBaseline(farm);
      // This was an external Farm revision. Its Tracker may have changed too.
      void syncAfterFarmWrite(false);
    } else {
      setRecovery({
        kind: "edit",
        version: baseline.version,
        conflict: true,
        latest: farm.version > baseline.version ? farm : undefined,
      });
    }
  }, [
    baseline,
    dirty,
    farm,
    farmSnapshotChanged,
    information?.headerLocked,
    recovery,
    saving,
    toggle,
    trackerBusy,
    syncAfterFarmWrite,
    uploading,
  ]);

  useLayoutEffect(() => {
    const uploads = uploadsRef.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      recoveryRequest.current?.abort();
      if (
        isCurrent() &&
        !accessRevoked.current &&
        farmAccess(queryClient).revision === accessRevision
      ) {
        discardTemporaryPhotos(uploads);
      }
    };
  }, [accessRevision, isCurrent, queryClient]);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const selector =
      pendingFocus.current === "name" ? "[data-bilingual-name]" : "[data-farm-location]";
    formRef.current?.querySelector<HTMLInputElement>(selector)?.focus();
    pendingFocus.current = null;
  }, [activeLocale, error]);

  async function upload(files: File[]) {
    if (!files.length || uploadLock.current || saveLock.current || !canAct()) return;
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
          if (!canAct()) {
            if (
              isCurrent() &&
              !accessRevoked.current &&
              farmAccess(queryClient).revision === accessRevision
            ) {
              void deleteFarmImage(asset.id, { keepalive: true }).catch(() => undefined);
            }
            break;
          }
          uploadsRef.current.set(asset.id.toLowerCase(), "temporary");
          setForm((current) => ({ ...current, photos: [...current.photos, asset] }));
        } catch (caught) {
          if (farmAccessDenied(caught)) {
            hideFarm(caught);
            break;
          }
          if (!canAct()) break;
          setPhotoError(requestErrorMessage(caught, translationRef.current));
        }
      }
    } finally {
      uploadLock.current = false;
      if (canAct()) setUploading(false);
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
    if (!canAct()) return;
    setForm((current) => ({
      ...current,
      photos: current.photos.filter((photo) => photo.id !== id),
    }));
    const uploadId = id.toLowerCase();
    if (uploadsRef.current.get(uploadId) === "temporary") {
      void deleteFarmImage(id)
        .then(() => uploadsRef.current.delete(uploadId))
        .catch((caught) => {
          if (farmAccessDenied(caught)) {
            hideFarm(caught);
          } else if (canAct()) {
            setPhotoError(requestErrorMessage(caught, translationRef.current));
          }
        });
    }
  }

  async function checkLatestFarm() {
    if (
      !farmId ||
      recovery?.kind !== "edit" ||
      recoveryRequest.current ||
      !canAct() ||
      information?.headerLocked
    )
      return;
    const controller = new AbortController();
    recoveryRequest.current = controller;
    setCheckingLatest(true);
    try {
      const before = captureFarmDetail(queryClient, farmId);
      const snapshot = await getFarm(farmId, controller.signal);
      if (!canAct() || controller.signal.aborted) return;
      const latest = publishFarmDetail(queryClient, snapshot, before, "read") ?? snapshot;
      // A read of the original revision does not settle an uncertain write.
      if (latest.version <= recovery.version) {
        setRecovery({ ...recovery, latest: undefined, stale: true });
        return;
      }
      forgetReferencedPhotos(uploadsRef.current, latest);
      setRecovery({ ...recovery, latest, stale: false, problem: undefined });
    } catch (caught) {
      if (farmAccessDenied(caught)) {
        hideFarm(caught);
        return;
      }
      if (!canAct() || controller.signal.aborted) return;
      if (farmNotFound(caught)) hideFarm(caught);
      else setRecovery({ ...recovery, problem: caught });
    } finally {
      recoveryRequest.current = null;
      if (canAct() && !controller.signal.aborted) setCheckingLatest(false);
    }
  }

  async function adoptLatestFarm(choice?: AlbumChoice) {
    if (recovery?.kind !== "edit" || !recovery.latest || !baseline || !canAct()) return;
    if (albumConflict && !choice) return;
    const release = information?.claimWrite();
    if (!release) return;
    const latest = recovery.latest;
    const cached = queryClient.getQueryData<Farm>(farmDetailKey(latest.id));
    if (cached && cached.version > latest.version) {
      setRecovery({ ...recovery, latest: cached });
      release();
      return;
    }
    try {
      const confirmedOwnWrite =
        !recovery.conflict &&
        latest.version === baseline.version + 1 &&
        latest.is_active === baseline.is_active &&
        Object.keys(changedFarmInformation(form, fromFarm(latest))).length === 0;
      forgetReferencedPhotos(uploadsRef.current, latest);
      const next = keepFarmEdits(
        delta,
        latest,
        form,
        choice ?? (serverAlbumChanges || !delta.photo_ids ? "server" : "local"),
        serverPhoneChanged,
      );
      if (choice === "server") discardTemporaryPhotos(uploadsRef.current, next.photos);
      setForm(next);
      setBaseline(latest);
      void queryClient.invalidateQueries({ queryKey: farmListKey });
      await tracker.syncAfterFarmWrite(confirmedOwnWrite);
      if (canAct()) {
        setRecovery(null);
        setError("");
        setPhoneServerError(false);
      }
    } finally {
      release();
    }
  }

  function undo() {
    if (
      !baseline ||
      !canAct() ||
      saving ||
      recovery ||
      uploadLock.current ||
      information?.headerLocked
    )
      return;
    discardTemporaryPhotos(uploadsRef.current);
    setForm(fromFarm(baseline));
    tracker.reset();
    setError("");
    setPhoneServerError(false);
    setPhotoError("");
  }

  function changePhone(next: EditablePhone) {
    setForm((current) => ({
      ...current,
      contact_phone: next.untouched ? { ...next, value: current.contact_phone.value } : next,
    }));
    if (next.value !== phone.value) setPhoneServerError(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      saveLock.current ||
      uploadLock.current ||
      recovery ||
      !canAct() ||
      (information && (!dirty || !tracker.ready || farmSnapshotChanged || information.headerLocked))
    ) {
      return;
    }
    for (const language of ["vi", "en"] as const) {
      const missing = !form[`name_${language}`].trim()
        ? "name"
        : !form[`location_${language}`].trim()
          ? "location"
          : null;
      if (missing) {
        const selector = missing === "name" ? "[data-bilingual-name]" : "[data-farm-location]";
        if (activeLocale === language)
          formRef.current?.querySelector<HTMLInputElement>(selector)?.focus();
        else {
          pendingFocus.current = missing;
          setActiveLocale(language);
        }
        setError(c.requiredBilingual);
        return;
      }
    }

    if (invalidPhone) {
      phoneRef.current?.focus();
      return;
    }

    const release = information?.claimWrite();
    if (information && !release) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    setPhoneServerError(false);
    const version = baseline?.version;
    const fields = farmInformation(form);
    const patch = information ? { ...delta, version } : { ...fields, is_active: initialActive };
    const uploads = uploadsRef.current;
    const submitted = (!information || delta.photo_ids ? fields.photo_ids : [])
      .map((id) => id.toLowerCase())
      .filter((id) => uploads.get(id) === "temporary");
    let sendingFarm = false;
    let leavingAfterCreate = false;
    try {
      // A Tracker write does not bump Farm.version. Farm writes do bump Tracker.version.
      if (information && !(await tracker.save())) return;
      if (!canAct()) return;
      if (information && !farmDirty) {
        toast(c.savedChanges);
        return;
      }
      for (const id of submitted) uploads.set(id, "submitted");
      sendingFarm = true;
      const before = farmId ? captureFarmDetail(queryClient, farmId) : undefined;
      const result = await saveFarm(farmId, patch);
      if (
        baseline &&
        (result.version !== baseline.version + 1 ||
          result.is_active !== baseline.is_active ||
          Object.keys(changedFarmInformation(form, fromFarm(result))).length)
      ) {
        throw invalidApiResponse();
      }
      sendingFarm = false;
      forgetReferencedPhotos(uploads, result);
      if (!isCurrent() || farmAccess(queryClient).revision !== accessRevision) return;
      if (information) publishFarmDetail(queryClient, result, before, "write");
      void queryClient.invalidateQueries({ queryKey: farmListKey });
      if (!canAct()) return;
      setForm(fromFarm(result));
      setBaseline(result);
      if (information) {
        const synced = await tracker.syncAfterFarmWrite();
        if (canAct()) toast(synced ? c.savedChanges : c.farmSaved);
      } else {
        // The create response has no delete capability. Let the detail query read its own snapshot.
        toast(c.farmSaved);
        leavingAfterCreate = true;
        router.replace(farmHref(search, { id: result.id }));
        router.refresh();
      }
    } catch (caught) {
      if (farmAccessDenied(caught)) {
        hideFarm(caught);
        return;
      }
      const problem = caught instanceof Error ? (caught as ClientApiError) : null;
      const unavailable = farmNotFound(caught);
      const rejected = !unavailable && farmSaveRejected(problem);
      if (rejected) for (const id of submitted) uploads.set(id, "temporary");
      if (!canAct()) {
        if (rejected && isCurrent() && farmAccess(queryClient).revision === accessRevision)
          discardTemporaryPhotos(uploads);
        return;
      }
      if (unavailable) hideFarm(caught);
      else if (sendingFarm && !rejected) {
        setRecovery(
          version === undefined
            ? { kind: "create", search: fields.name_vi.slice(0, 200) }
            : { kind: "edit", version },
        );
      } else if (sendingFarm && version !== undefined && problem?.status === 409) {
        setRecovery({ kind: "edit", version, conflict: true });
      } else {
        const phoneRejected =
          problem?.message === "validation_error" &&
          (problem.field === "contact_phone" ||
            "contact_phone" in apiErrorFields(problem) ||
            "contact_phone" in (problem.payload ?? {}));
        if (phoneRejected) setPhoneServerError(true);
        if (!phoneRejected || (problem.field && problem.field !== "contact_phone")) {
          setError(requestErrorMessage(caught, translationRef.current));
        }
      }
    } finally {
      saveLock.current = leavingAfterCreate;
      release?.();
      if (canAct() && !leavingAfterCreate) setSaving(false);
    }
  }

  const heading = !information && (
    <>
      <AdminBreadcrumbForRoute
        pathname={farmHref(null, { mode: "new" })}
        search={search?.toString() ?? ""}
        items={[{ label: t.common.farmList, href: listHref }, { label: t.breadcrumb.newFarm }]}
      />
      <PageHeading title={t.breadcrumb.newFarm} visuallyHiddenTitle />
    </>
  );
  const locked = saving || Boolean(information?.headerLocked);
  const fieldBusy = locked || recovery !== null;
  const sectionSpan = information ? { base: 12, sm: 6 } : 12;
  const cancel = !information && (
    <Button
      component={AdminNavigationLink}
      variant="default"
      href={listHref}
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

  if (!isCurrent())
    return (
      <Alert color="danger" role="alert">
        {t.common.sessionChanged}
      </Alert>
    );
  if (access.error) {
    return (
      <>
        {heading}
        <RecoveryAlert
          message={requestErrorMessage(access.error, t)}
          retryLabel={t.common.retry}
          onRetry={() => retryFarmAccess(queryClient)}
        />
      </>
    );
  }

  return (
    <>
      {heading}
      <Box
        component="form"
        w="100%"
        maw={information ? undefined : 760}
        mb="lg"
        noValidate
        onSubmit={submit}
        ref={formRef}
      >
        <Stack gap="md">
          {recovery?.kind === "create" && (
            <Alert color="warning" role="alert">
              <Stack gap="sm" align="flex-start">
                <Text size="sm">{c.createUncertain}</Text>
                <Anchor
                  component={AdminNavigationLink}
                  href={farmHref(new URLSearchParams({ search: recovery.search }))}
                  target="_blank"
                  rel="noopener"
                >
                  {c.searchAttemptedFarm}
                </Anchor>
              </Stack>
            </Alert>
          )}
          {recovery?.kind === "edit" &&
            (recovery.latest ? (
              <Alert color="warning" role="alert">
                <Stack gap="sm" miw={0}>
                  <Text size="sm">{c.latestFarmAvailable}</Text>
                  {baseline && (
                    <Stack gap="xs">
                      {textFields
                        .filter((field) => baseline[field] !== recovery.latest?.[field])
                        .map((field) => (
                          <Text key={field} size="sm" style={{ overflowWrap: "anywhere" }}>
                            {field.startsWith("name")
                              ? c.nameField
                              : field.startsWith("location")
                                ? c.location
                                : c.descriptionField}{" "}
                            {field.endsWith("vi") ? t.common.vietnamese : t.common.english}
                            {" · "}
                            {recovery.latest?.[field] || "—"}
                          </Text>
                        ))}
                      {serverPhoneChanged && reviewedForm && (
                        <Text size="sm">
                          {c.contactPhone}
                          {" · "}
                          {reviewedForm.contact_phone.value || "—"}
                        </Text>
                      )}
                    </Stack>
                  )}
                  {serverAlbumChanges && reviewedForm && baselineForm && (
                    <Stack gap="xs" miw={0}>
                      <Text size="sm" fw={600}>
                        {c.serverAlbumChanged}
                      </Text>
                      <Text size="sm">
                        {(Object.keys(serverAlbumChanges) as (keyof typeof serverAlbumChanges)[])
                          .filter((change) => serverAlbumChanges[change])
                          .map((change) => c[change])
                          .join(" · ")}
                      </Text>
                      {(serverAlbumChanges.albumRemoved ||
                        serverAlbumChanges.albumReordered ||
                        serverAlbumChanges.albumCoverChanged) && (
                        <>
                          <Text size="sm" fw={600}>
                            {c.previousAlbum}
                          </Text>
                          <AdminImagePicker
                            items={albumItems(baselineForm.photos, c.previousAlbum)}
                            maxItems={12}
                            labels={{ ...imagePickerLabels, select: c.previousAlbum }}
                          />
                        </>
                      )}
                      <Text size="sm" fw={600}>
                        {c.serverAlbum}
                      </Text>
                      <AdminImagePicker
                        items={albumItems(reviewedForm.photos, c.serverAlbum)}
                        maxItems={12}
                        labels={{ ...imagePickerLabels, select: c.serverAlbum }}
                      />
                      {albumConflict && (
                        <>
                          <Text size="sm" fw={600}>
                            {c.draftAlbum}
                          </Text>
                          <AdminImagePicker
                            items={albumItems(form.photos, c.draftAlbum)}
                            maxItems={12}
                            labels={{ ...imagePickerLabels, select: c.draftAlbum }}
                          />
                          <Text size="sm">{c.albumChoiceHint}</Text>
                        </>
                      )}
                    </Stack>
                  )}
                  <Group gap="xs">
                    {albumConflict ? (
                      <>
                        <Button
                          variant="default"
                          type="button"
                          disabled={locked}
                          onClick={() => void adoptLatestFarm("server")}
                        >
                          {c.useServerAlbum}
                        </Button>
                        <Button
                          variant="default"
                          type="button"
                          disabled={locked}
                          onClick={() => void adoptLatestFarm("local")}
                        >
                          {c.keepDraftAlbum}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="default"
                        type="button"
                        disabled={locked}
                        onClick={() => void adoptLatestFarm()}
                      >
                        {c.useLatestFarm}
                      </Button>
                    )}
                  </Group>
                </Stack>
              </Alert>
            ) : (
              <RecoveryAlert
                message={[
                  recovery.conflict ? c.conflict : c.saveUncertain,
                  recovery.stale ? c.saveStillUncertain : "",
                  recovery.problem ? requestErrorMessage(recovery.problem, t) : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                retryLabel={c.checkLatestFarm}
                onRetry={checkLatestFarm}
                loading={checkingLatest}
              />
            ))}
          {error && (
            <Alert color="danger" role="alert">
              {error}
            </Alert>
          )}
          <Grid type="container" breakpoints={breakpoints} gutter="md" align="flex-start">
            <Grid.Col span={sectionSpan}>
              <BilingualContentFields
                activeLocale={activeLocale}
                busy={fieldBusy}
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
                    disabled={fieldBusy}
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
            <Grid.Col span={sectionSpan}>
              <Stack gap="md">
                <PhoneInput
                  name="contact_phone"
                  autoComplete="tel"
                  disabled={fieldBusy}
                  state={phone}
                  error={phoneServerError ? c.invalidContactPhone : undefined}
                  onChange={changePhone}
                  ref={phoneRef}
                />
                <Paper component="section" aria-label={c.photos} p="md" withBorder miw={0}>
                  <Stack gap="md">
                    <Stack component="section" gap="xs">
                      <Group gap="xs">
                        <Title order={2}>{c.photos}</Title>
                        <Text component="span" size="sm" c="dimmed">
                          {form.photos.length}/12
                        </Text>
                      </Group>
                      <AdminImagePicker
                        items={albumItems(form.photos, c.photos)}
                        maxItems={12}
                        busy={uploading || fieldBusy}
                        error={photoError}
                        help={c.photoHint}
                        labels={{
                          ...imagePickerLabels,
                          uploading: uploading
                            ? locale === "vi"
                              ? "Đang tải ảnh…"
                              : "Uploading images…"
                            : undefined,
                        }}
                        onChooseFiles={upload}
                        onMove={movePhoto}
                        onSetCover={setCover}
                        onRemove={removePhoto}
                      />
                    </Stack>
                    {!information && (
                      <>
                        <Divider />
                        <Select
                          label={c.status}
                          allowDeselect={false}
                          disabled={fieldBusy}
                          value={String(initialActive)}
                          onChange={(selection) => setInitialActive(selection === "true")}
                          data={[
                            { value: "true", label: c.active },
                            { value: "false", label: c.inactive },
                          ]}
                        />
                      </>
                    )}
                  </Stack>
                </Paper>
                {information && (
                  <Paper p="md" withBorder miw={0}>
                    <FarmTrackerFields
                      tracker={tracker}
                      disabled={fieldBusy}
                      farmActive={information.farm.is_active}
                    />
                  </Paper>
                )}
              </Stack>
            </Grid.Col>
          </Grid>
          <Group component="footer" justify="flex-end" gap="xs">
            {cancel}
            {information && dirty && (
              <Button
                type="button"
                variant="default"
                onClick={undo}
                disabled={fieldBusy || uploading || tracker.busy}
              >
                {c.undo}
              </Button>
            )}
            <Button
              type="submit"
              loading={saving}
              disabled={
                fieldBusy ||
                uploading ||
                invalidPhone ||
                Boolean(information && (!dirty || !valid || !tracker.ready || farmSnapshotChanged))
              }
            >
              {saving ? c.saving : information ? c.save : c.create}
            </Button>
          </Group>
        </Stack>
      </Box>
    </>
  );
}
