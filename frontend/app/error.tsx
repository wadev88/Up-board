"use client";

import { ErrorState } from "@/components/common/ErrorState";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main-content" className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <ErrorState
        className="w-full"
        title="เกิดข้อผิดพลาด"
        description="ระบบขัดข้องชั่วคราว กรุณาลองอีกครั้ง"
        onRetry={reset}
      />
    </main>
  );
}
