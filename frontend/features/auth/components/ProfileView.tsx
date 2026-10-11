"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { History, LogOut, Pencil, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/avatar";
import { FormField, fieldDescribedBy } from "@/components/ui/form-field";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Pagination } from "@/components/common/Pagination";
import { useAuth } from "@/hooks/useAuth";
import { useNow } from "@/hooks/useNow";
import { HISTORY_STATE_LABELS, POST_TYPE_LABELS, ROLE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { reportFormError } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { useFaculties, useUpdateProfile } from "@/features/auth/hooks";
import { FacultyProgramFields } from "@/features/auth/components/FacultyProgramFields";
import { profileSchema, type ProfileValues } from "@/features/auth/schemas";
import { ContactList } from "@/features/auth/components/ContactList";
import { SuspensionNotice } from "@/features/auth/components/AccountNotices";
import { usePostHistory } from "@/features/posts/hooks";
import { useRepairs } from "@/features/repairs/hooks";
import { POST_GRID, PostCard, PostListSkeleton } from "@/features/posts/components/PostCard";
import type { HistoryState, PostType, User } from "@/types/api";
import type { UpdateMeBody } from "@/features/auth/api";

/** Name, faculty + program and contacts — self-service, no admin needed. The role is not. */
function EditProfileForm({ user, onDone }: { user: User; onDone: () => void }) {
  const update = useUpdateProfile();
  const faculties = useFaculties();
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      display_name: user.display_name,
      faculty_id: user.faculty?.id ?? 0,
      program_id: user.program?.id ?? 0,
      contact_facebook: user.contacts.facebook ?? "",
      contact_instagram: user.contacts.instagram ?? "",
      contact_line: user.contacts.line ?? "",
    },
  });
  const error = form.formState.errors.display_name?.message;
  const onSubmit = form.handleSubmit(async (v) => {
    const body: UpdateMeBody = { display_name: v.display_name };
    if (v.faculty_id > 0) {
      body.faculty_id = v.faculty_id;
      body.program_id = v.program_id;
    }
    body.contacts = {
      facebook: v.contact_facebook,
      instagram: v.contact_instagram,
      line: v.contact_line,
    };
    try {
      await update.mutateAsync(body);
      toast.success("บันทึกโปรไฟล์แล้ว");
      onDone();
    } catch (e) {
      reportFormError(e, form.setError, ["display_name", "faculty_id", "program_id", "contact_facebook", "contact_instagram", "contact_line"]);
    }
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-xl border border-border p-4" noValidate>
      <FormField id="profile-name" label="ชื่อที่แสดง" error={error}>
        <Input
          id="profile-name"
          autoFocus
          aria-invalid={!!error || undefined}
          aria-describedby={fieldDescribedBy("profile-name", error)}
          {...form.register("display_name")}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        {user.faculty?.admin_only ? (
          // university central / facilities: only an admin can change it, so it is shown as is
          <>
            <FormField id="profile-faculty" label="คณะ" hint="หน่วยงานนี้กำหนดโดยผู้ดูแลระบบเท่านั้น">
              <Input id="profile-faculty" value={user.faculty.name_th} readOnly disabled />
            </FormField>
            <FormField id="profile-program" label="สาขาวิชา">
              <Input id="profile-program" value={user.program?.name_th ?? "—"} readOnly disabled />
            </FormField>
          </>
        ) : (
          <FacultyProgramFields
            form={form}
            faculties={faculties.data}
            idPrefix="profile"
            requiredFaculty={user.faculty !== null}
            requiredProgram={user.faculty !== null}
            noFacultyLabel={user.faculty ? "เลือกคณะ" : "— ไม่ระบุ —"}
            currentProgram={user.program}
          />
        )}
      </div>
      <fieldset className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-medium">ช่องทางติดต่อ (ไม่บังคับ)</legend>
        <p className="text-xs text-muted-foreground sm:col-span-3">
          ผู้ใช้อื่นเห็นเฉพาะช่องทางที่คุณกรอกในหน้าโปรไฟล์สาธารณะของคุณ เว้นว่างเพื่อไม่แสดง
        </p>
        <FormField id="profile-facebook" label="Facebook" error={form.formState.errors.contact_facebook?.message}>
          <Input id="profile-facebook" placeholder="ชื่อหรือลิงก์ Facebook" {...form.register("contact_facebook")} />
        </FormField>
        <FormField id="profile-instagram" label="Instagram" error={form.formState.errors.contact_instagram?.message}>
          <Input id="profile-instagram" placeholder="@username" {...form.register("contact_instagram")} />
        </FormField>
        <FormField id="profile-line" label="LINE" error={form.formState.errors.contact_line?.message}>
          <Input id="profile-line" placeholder="LINE ID" {...form.register("contact_line")} />
        </FormField>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          ยกเลิก
        </Button>
        <Button type="submit" loading={update.isPending}>
          บันทึก
        </Button>
      </div>
    </form>
  );
}

const pill =
  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9";

function FilterPills<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (value: T | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="text-xs font-medium text-muted-foreground">{label}:</span>
      {[{ value: undefined, label: "ทั้งหมด" } as { value: T | undefined; label: string }, ...options].map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value ?? "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              pill,
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const HISTORY_TYPES: PostType[] = ["general", "announcement", "event", "repair", "lost_found"];
const HISTORY_STATES: HistoryState[] = ["active", "expired", "resolved", "archived"];

/**
 * Post History (GET /me/posts): every post the user wrote, including posts that left the feeds
 * (24h rule, ended events), resolved repairs, returned items and archived lost & found posts.
 * The API always scopes it to the signed-in user.
 */
function PostHistory() {
  const [type, setType] = useState<PostType | undefined>();
  const [state, setState] = useState<HistoryState | undefined>();
  const [page, setPage] = useState(1);
  const now = useNow();
  const q = usePostHistory({ type, state, page, page_size: 12 });

  let content: React.ReactNode;
  if (q.isLoading) content = <PostListSkeleton count={3} />;
  else if (q.isError) content = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else if (!q.data || q.data.items.length === 0)
    content = (
      <EmptyState
        icon={type || state ? <SearchX /> : <History />}
        title={type || state ? "ไม่มีโพสต์ที่ตรงกับตัวกรอง" : "คุณยังไม่มีโพสต์"}
        description={type || state ? "ลองเปลี่ยนประเภทหรือสถานะ" : "โพสต์ทุกประเภทของคุณจะถูกเก็บไว้ที่นี่ แม้หมดเวลาแสดงในฟีดแล้ว"}
      />
    );
  else
    content = (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">ทั้งหมด {q.data.total.toLocaleString("th-TH")} โพสต์</p>
        <ul className={POST_GRID}>
          {q.data.items.map((p) => (
            <li key={p.id}>
              <PostCard post={p} now={now} showCountdown={false} showActions />
            </li>
          ))}
        </ul>
        <Pagination page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPageChange={setPage} />
      </div>
    );

  return (
    <section id="history" aria-labelledby="history-title" className="scroll-mt-24 space-y-4">
      <div className="space-y-1">
        <h2 id="history-title" className="flex items-center gap-2 text-lg font-semibold">
          <History className="size-5 text-primary" aria-hidden="true" />
          ประวัติโพสต์
        </h2>
        <p className="text-sm text-muted-foreground">
          โพสต์ที่หมดเวลาแสดงในฟีด งานซ่อมที่เสร็จแล้ว และประกาศที่เก็บถาวร ยังอยู่ครบที่นี่ (เห็นเฉพาะคุณ)
        </p>
      </div>
      <div className="space-y-2">
        <FilterPills
          label="ประเภท"
          value={type}
          options={HISTORY_TYPES.map((t) => ({ value: t, label: POST_TYPE_LABELS[t] }))}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
        />
        <FilterPills
          label="สถานะ"
          value={state}
          options={HISTORY_STATES.map((s) => ({ value: s, label: HISTORY_STATE_LABELS[s] }))}
          onChange={(v) => {
            setState(v);
            setPage(1);
          }}
        />
      </div>
      <div aria-live="polite" aria-busy={q.isFetching || undefined}>
        {content}
      </div>
    </section>
  );
}

/** Technicians: their assigned jobs (the API filters by the signed-in technician). */
function AssignedJobs() {
  const [page, setPage] = useState(1);
  const now = useNow();
  const q = useRepairs({ assigned_to_me: true, page, page_size: 6 });
  return (
    <section aria-labelledby="jobs-title" className="space-y-4">
      <h2 id="jobs-title" className="text-lg font-semibold">
        งานซ่อมที่ได้รับมอบหมาย
      </h2>
      {q.isLoading ? (
        <PostListSkeleton count={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data || q.data.items.length === 0 ? (
        <EmptyState title="ยังไม่มีงานที่ได้รับมอบหมาย" />
      ) : (
        <div className="space-y-4">
          <ul className={POST_GRID}>
            {q.data.items.map((p) => (
              <li key={p.id}>
                <PostCard post={p} now={now} />
              </li>
            ))}
          </ul>
          <Pagination page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPageChange={setPage} />
        </div>
      )}
    </section>
  );
}

export function ProfileView() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="space-y-8">
      <h1 className="sr-only">โปรไฟล์ของฉัน</h1>
      <Card className="overflow-hidden">
        <div className="h-20 bg-linear-to-r from-primary-soft to-secondary-soft" aria-hidden="true" />
        <CardContent className="-mt-10 space-y-4 p-5">
          <div className="flex items-end gap-4">
            <UserAvatar name={user.display_name} className="size-20 border-4 border-card text-2xl" />
            <div className="min-w-0 flex-1 space-y-1 pb-1">
              <p className="truncate text-xl font-semibold">{user.display_name}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
            {!editing && (
              <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label="แก้ไขโปรไฟล์">
                <Pencil aria-hidden="true" />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="accent">{ROLE_LABELS[user.role]}</Badge>
            {user.faculty && <Badge variant="outline">{user.faculty.name_th}</Badge>}
            {user.program && <Badge variant="outline">{user.program.name_th}</Badge>}
            {user.is_technician && <Badge variant="outline">พร้อมรับงานซ่อม</Badge>}
          </div>
          {!editing && <ContactList contacts={user.contacts} />}
          {editing && <EditProfileForm user={user} onDone={() => setEditing(false)} />}
          <p className="text-xs text-muted-foreground">เป็นสมาชิกตั้งแต่ {formatDate(user.created_at)}</p>
          <SuspensionNotice />
        </CardContent>
      </Card>

      {user.role === "technician" && <AssignedJobs />}
      <PostHistory />

      <Button variant="outline" onClick={handleLogout} className="w-full sm:w-auto">
        <LogOut aria-hidden="true" />
        ออกจากระบบ
      </Button>
    </div>
  );
}
