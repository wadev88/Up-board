"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, fieldDescribedBy } from "@/components/ui/form-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Google sign-in of a self-registered account that is not verified yet (API: 403
 * PASSWORD_CONFIRMATION_REQUIRED). The registration password proves it is the same person who
 * registered. `onSubmit` resolves to an error message (wrong password, rate limit ...) or null
 * on success. The password lives only in this component's state and is never stored or logged.
 */
export function PasswordConfirmDialog({
  open,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  onSubmit: (password: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password) {
      setError("กรุณากรอกรหัสผ่าน");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await onSubmit(password);
    setSubmitting(false);
    if (result) {
      setError(result);
      setPassword("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !submitting && onCancel()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>ยืนยันอีเมลของคุณ</DialogTitle>
            <DialogDescription>ใส่รหัสผ่านที่ตั้งไว้ตอนสมัครเพื่อยืนยันอีเมล</DialogDescription>
          </DialogHeader>
          <FormField id="confirm-password" label="รหัสผ่านที่ตั้งไว้ตอนสมัคร" error={error ?? undefined}>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error || undefined}
              aria-describedby={fieldDescribedBy("confirm-password", error ?? undefined)}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
              ยกเลิก
            </Button>
            <Button type="submit" loading={submitting}>
              ยืนยัน
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
