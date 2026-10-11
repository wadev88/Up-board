"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Camera, Check, Crosshair, FileText, ImageIcon, MapPin, ShieldAlert, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, fieldDescribedBy } from "@/components/ui/form-field";
import { ImageUploader } from "@/components/common/ImageUploader";
import { reportFormError } from "@/lib/forms";
import { useNow } from "@/hooks/useNow";
import { REPAIR_COOLDOWN_SECONDS } from "@/lib/constants";
import { formatTime } from "@/lib/format";
import { isApiError } from "@/services/apiClient";
import { cn } from "@/lib/utils";
import { SuspensionNotice, useSuspendedUntil } from "@/features/auth/components/AccountNotices";
import { useCreateRepair } from "@/features/repairs/hooks";
import { REPAIR_STEP_FIELDS, repairFormSchema, type RepairFormValues } from "@/features/repairs/schemas";

/** Wall clock, read from event handlers only. */
const nowMs = () => Date.now();

const STEPS = ["รูปภาพ", "ตำแหน่ง", "รายละเอียด"] as const;
const FIELDS = ["attachment_ids", "location", "latitude", "longitude", "title", "content"] as const;

/** 3-step repair report wizard: photos → location → details. */
export function RepairForm() {
  const router = useRouter();
  const create = useCreateRepair();
  const [step, setStep] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [geoStatus, setGeoStatus] = useState<"idle" | "locating" | "error">("idle");
  const [geoError, setGeoError] = useState<string | null>(null);
  // 429 REPAIR_TOO_FAST: one repair report per user every 2 minutes
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const now = useNow({ enabled: cooldownUntil !== null, intervalMs: 5000 });
  const suspended = !!useSuspendedUntil(); // suspended users cannot create any post type
  const coolingDown = cooldownUntil !== null && now < cooldownUntil;

  const form = useForm<RepairFormValues>({
    resolver: zodResolver(repairFormSchema),
    defaultValues: {
      attachment_ids: [],
      location: "",
      latitude: null,
      longitude: null,
      title: "",
      content: "",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const [lat, lng] = useWatch({ control: form.control, name: ["latitude", "longitude"] });
  const [photoIds, locationValue, titleValue] = useWatch({
    control: form.control,
    name: ["attachment_ids", "location", "title"],
  });

  // Move focus to the new step's heading when the step changes (not on first render).
  const stepHeadings = useRef<(HTMLHeadingElement | null)[]>([]);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    stepHeadings.current[step]?.focus();
  }, [step]);

  const goNext = async () => {
    const ok = await form.trigger([...REPAIR_STEP_FIELDS[step]]);
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleLocate = () => {
    if (!("geolocation" in navigator)) {
      setGeoStatus("error");
      setGeoError("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
      return;
    }
    setGeoStatus("locating");
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        form.setValue("latitude", Number(pos.coords.latitude.toFixed(6)));
        form.setValue("longitude", Number(pos.coords.longitude.toFixed(6)));
        setGeoStatus("idle");
      },
      (err) => {
        setGeoStatus("error");
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "เบราว์เซอร์บล็อกการเข้าถึงตำแหน่ง: กดไอคอนหน้าแถบที่อยู่ (ข้าง URL) → ตำแหน่ง → อนุญาต แล้วกดปุ่มอีกครั้ง (บน Windows ต้องเปิด Settings → Privacy & security → Location ด้วย) หรือพิมพ์ตำแหน่งในช่องด้านบนแทน"
            : "ไม่สามารถระบุตำแหน่งได้ ตรวจสอบว่าเปิดบริการตำแหน่งของอุปกรณ์แล้ว และลองใหม่",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const onSubmit = form.handleSubmit(
    async (v) => {
      try {
        const post = await create.mutateAsync({
          title: v.title,
          content: v.content,
          location: v.location,
          ...(v.latitude !== null && v.longitude !== null ? { latitude: v.latitude, longitude: v.longitude } : {}),
          attachment_ids: v.attachment_ids,
        });
        toast.success("ส่งเรื่องแจ้งซ่อมแล้ว");
        router.push(`/repairs/${post.id}`);
      } catch (e) {
        if (isApiError(e) && e.code === "REPAIR_TOO_FAST") {
          const retry = e.detail("retry_at");
          const at = retry ? new Date(retry).getTime() : nowMs() + REPAIR_COOLDOWN_SECONDS * 1000;
          setCooldownUntil(Number.isFinite(at) ? at : nowMs() + REPAIR_COOLDOWN_SECONDS * 1000);
          toast.error(e.userMessage);
          return;
        }
        if (reportFormError(e, form.setError, FIELDS)) {
          const firstBad = REPAIR_STEP_FIELDS.findIndex((fields) =>
            fields.some((f) => form.getFieldState(f).error),
          );
          if (firstBad >= 0) setStep(firstBad);
        }
      }
    },
    (errs) => {
      const firstBad = REPAIR_STEP_FIELDS.findIndex((fields) => fields.some((f) => f in errs));
      if (firstBad >= 0) setStep(firstBad);
    },
  );

  const err = (name: keyof RepairFormValues) => errors[name]?.message as string | undefined;
  const headingClass = "flex items-center gap-2 text-lg font-semibold focus:outline-none";
  const noteClass =
    "flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto max-w-[720px] rounded-2xl border border-border/70 bg-card shadow-card"
      noValidate
    >
      <div className="grid gap-6 p-4 sm:p-6">
        {/* step indicator: numbered circles joined by a line */}
        <ol className="flex items-start" aria-label="ขั้นตอนการแจ้งซ่อม">
          {STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li
                key={label}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-1.5 text-center",
                  i > 0 && "before:absolute before:right-1/2 before:top-4 before:h-0.5 before:w-full before:-translate-y-1/2",
                  i > 0 && (i <= step ? "before:bg-primary" : "before:bg-border"),
                )}
              >
                <span
                  className={cn(
                    "relative z-10 inline-flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary bg-background text-primary ring-4 ring-primary/15",
                    !done && !active && "border-border bg-background text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
                  <span className="sr-only">{done ? " (เสร็จแล้ว)" : active ? " (ขั้นตอนปัจจุบัน)" : ""}</span>
                </span>
                <span className={cn("text-xs", active ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
              </li>
            );
          })}
        </ol>

        {/* Step 1: photos (kept mounted so uploads survive navigation between steps) */}
        <section hidden={step !== 0} aria-labelledby="step-photos" className="grid gap-4">
          <h2 id="step-photos" ref={(el) => { stepHeadings.current[0] = el; }} tabIndex={-1} className={headingClass}>
            <Camera className="size-5 text-primary" aria-hidden="true" />
            ถ่ายรูปจุดที่ชำรุด
          </h2>
          <p className={noteClass} role="note">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            หลีกเลี่ยงการถ่ายติดใบหน้าบุคคล ระบบจะลบข้อมูลตำแหน่ง (EXIF/GPS) ออกจากรูปโดยอัตโนมัติ
          </p>
          <ImageUploader
            large
            label="รูปภาพ (จำเป็น อย่างน้อย 1 รูป)"
            onChange={(ids) => form.setValue("attachment_ids", ids)}
            onUploadingChange={setUploading}
            error={err("attachment_ids")}
          />
        </section>

        {step === 1 && (
          <section aria-labelledby="step-location" className="grid gap-4">
            <h2 id="step-location" ref={(el) => { stepHeadings.current[1] = el; }} tabIndex={-1} className={headingClass}>
              <MapPin className="size-5 text-primary" aria-hidden="true" />
              ตำแหน่ง
            </h2>
            <FormField id="repair-location" label="ตำแหน่ง" required error={err("location")} hint="เช่น อาคาร CE ชั้น 2 ห้อง CE2201 ใกล้ลิฟต์">
              <Input
                id="repair-location"
                aria-invalid={!!errors.location || undefined}
                aria-describedby={fieldDescribedBy("repair-location", err("location"), true)}
                {...form.register("location")}
              />
            </FormField>
            <div className="grid gap-2 rounded-xl border border-border bg-subtle/60 p-4">
              <Button type="button" variant="outline" onClick={handleLocate} loading={geoStatus === "locating"} className="w-full sm:w-auto sm:justify-self-start">
                <Crosshair aria-hidden="true" />
                ใช้ตำแหน่งปัจจุบัน
              </Button>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {lat !== null && lng !== null
                  ? `พิกัด: ${lat}, ${lng} (เห็นเฉพาะผู้แจ้ง เจ้าหน้าที่ และช่างที่ได้รับมอบหมาย)`
                  : "พิกัด GPS ไม่บังคับ"}
              </p>
              {geoError && (
                <p className="text-sm text-destructive" role="alert">
                  {geoError}
                </p>
              )}
              {lat !== null && (
                <Button
                  type="button"
                  variant="link"
                  className="justify-self-start"
                  onClick={() => {
                    form.setValue("latitude", null);
                    form.setValue("longitude", null);
                  }}
                >
                  ล้างพิกัด
                </Button>
              )}
            </div>
          </section>
        )}

        {step === 2 && (
          <section aria-labelledby="step-details" className="grid gap-4">
            <h2 id="step-details" ref={(el) => { stepHeadings.current[2] = el; }} tabIndex={-1} className={headingClass}>
              <FileText className="size-5 text-primary" aria-hidden="true" />
              รายละเอียด
            </h2>
            <FormField id="repair-title" label="หัวข้อ" required error={err("title")}>
              <Input
                id="repair-title"
                placeholder="เช่น ไฟทางเดินดับ"
                aria-invalid={!!errors.title || undefined}
                aria-describedby={fieldDescribedBy("repair-title", err("title"))}
                {...form.register("title")}
              />
            </FormField>
            <FormField id="repair-content" label="อธิบายปัญหา" required error={err("content")}>
              <Textarea
                id="repair-content"
                rows={5}
                aria-invalid={!!errors.content || undefined}
                aria-describedby={fieldDescribedBy("repair-content", err("content"))}
                {...form.register("content")}
              />
            </FormField>
            <dl
              aria-label="สรุปข้อมูลที่กรอก"
              data-testid="repair-summary"
              className="grid gap-2 rounded-xl border border-border bg-subtle/60 p-4 text-sm"
            >
              <div className="flex items-center gap-2">
                <dt className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                  <ImageIcon className="size-4" aria-hidden="true" />
                  รูปภาพ
                </dt>
                <dd className="font-medium">{photoIds.length} รูป</dd>
              </div>
              <div className="flex items-start gap-2">
                <dt className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                  <MapPin className="size-4" aria-hidden="true" />
                  ตำแหน่ง
                </dt>
                <dd className="min-w-0 break-words font-medium">
                  {locationValue || "—"}
                  {lat !== null && lng !== null && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      พิกัด {lat}, {lng}
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex items-start gap-2">
                <dt className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                  <Wrench className="size-4" aria-hidden="true" />
                  หัวข้อ
                </dt>
                <dd className="min-w-0 break-words font-medium">{titleValue || "—"}</dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">
              เจ้าหน้าที่กองอาคารสถานที่จะประเมินความเร่งด่วนหลังได้รับเรื่อง
            </p>
          </section>
        )}

        {suspended && <SuspensionNotice />}
        {coolingDown && cooldownUntil !== null && (
          <p role="alert" className={noteClass}>
            แจ้งซ่อมได้ทุก 2 นาที กรุณารอจนถึง {formatTime(new Date(cooldownUntil).toISOString())} แล้วลองส่งอีกครั้ง
          </p>
        )}
      </div>

      {/* action row: sticks above the mobile bottom navigation; full-width stacked buttons on phones */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex flex-col-reverse gap-2 rounded-b-2xl border-t border-border bg-card/95 p-4 backdrop-blur sm:flex-row sm:justify-between sm:px-6 lg:bottom-0 [&>button]:w-full sm:[&>button]:w-auto">
        <Button
          type="button"
          variant="outline"
          onClick={() => (step === 0 ? router.back() : setStep((s) => s - 1))}
        >
          {step === 0 ? "ยกเลิก" : "ย้อนกลับ"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={goNext} disabled={uploading}>
            {uploading ? "กำลังอัปโหลดรูป…" : "ถัดไป"}
          </Button>
        ) : (
          <Button type="submit" loading={isSubmitting} disabled={uploading || coolingDown || suspended}>
            ส่งเรื่องแจ้งซ่อม
          </Button>
        )}
      </div>
    </form>
  );
}
