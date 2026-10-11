import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="text-2xl font-semibold">ไม่พบหน้าที่คุณต้องการ</h1>
      <p className="text-muted-foreground">ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ถูกย้ายไปแล้ว</p>
      <Link
        href="/dashboard"
        className="inline-flex h-12 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground md:h-10"
      >
        กลับหน้าแรก
      </Link>
    </main>
  );
}
