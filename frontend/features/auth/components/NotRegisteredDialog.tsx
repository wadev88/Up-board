"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Google sign-in of an email that has no account (API: 403 NOT_REGISTERED). Registration comes
 * first, so the user is pointed to /register. Modal: focus is trapped and Esc / "ปิด" closes it.
 */
export function NotRegisteredDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ยังไม่มีบัญชีในระบบ</DialogTitle>
          <DialogDescription>
            อีเมลนี้ยังไม่ได้สมัครสมาชิก กรุณาสมัครสมาชิกก่อน แล้วจึงเข้าสู่ระบบด้วยรหัสผ่านหรือ Google
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              ปิด
            </Button>
          </DialogClose>
          <Button asChild>
            <Link href="/register">ไปหน้าสมัครสมาชิก</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
