"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { GraduationCap, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@/lib/constants";
import { reportFormError } from "@/lib/forms";
import { roleFromEmail } from "@/lib/studentEmail";
import { useCompleteOnboarding, useFaculties } from "@/features/auth/hooks";
import type { User } from "@/types/api";
import { onboardingSchema, type OnboardingValues } from "@/features/auth/schemas";
import { FacultyProgramFields } from "@/features/auth/components/FacultyProgramFields";

/**
 * First sign-in of a self-registered account. The role follows the email (student ids are
 * numeric, staff addresses are names) — the API decides the same way; the user only adds the
 * faculty and program (both required). They can be changed later on the profile page.
 */
export function OnboardingForm() {
  const { user, status } = useAuth();
  const router = useRouter();
  const done = !!user?.profile_completed;
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login?next=%2Fonboarding");
    else if (done) router.replace("/dashboard");
  }, [status, done, router]);

  // the role (and so the validation) depends on the email: mount only once the session is known
  if (!user || done) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        กำลังโหลด…
      </p>
    );
  }
  return <OnboardingFields user={user} />;
}

function OnboardingFields({ user }: { user: User }) {
  const router = useRouter();
  const faculties = useFaculties();
  const complete = useCompleteOnboarding();
  const role = roleFromEmail(user.email);
  const isStudent = role === "student";

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      faculty_id: user.faculty?.id ?? 0,
      program_id: user.program?.id ?? 0,
    },
  });
  const { isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await complete.mutateAsync({ faculty_id: v.faculty_id, program_id: v.program_id });
      toast.success("ตั้งค่าบัญชีเรียบร้อย ยินดีต้อนรับสู่ UP Board");
      router.replace("/dashboard");
    } catch (e) {
      reportFormError(e, form.setError, ["faculty_id", "program_id"]);
    }
  });

  const RoleIcon = isStudent ? GraduationCap : Presentation;

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary-soft p-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary">
          <RoleIcon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">บัญชีของคุณ</p>
          <p className="font-semibold">{ROLE_LABELS[role]}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <FacultyProgramFields form={form} faculties={faculties.data} idPrefix="onboarding" />

      <p className="text-xs text-muted-foreground">แก้ไขคณะและสาขาวิชาได้ภายหลังที่หน้าโปรไฟล์</p>

      <Button type="submit" loading={isSubmitting} className="w-full">
        เริ่มใช้งาน
      </Button>
    </form>
  );
}
