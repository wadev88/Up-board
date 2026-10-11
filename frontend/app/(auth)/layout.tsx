import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center px-4 sm:px-8">
        <Link href="/login" aria-label="UP Board หน้าเข้าสู่ระบบ" className="inline-flex min-h-12 items-center">
          <Image src="/logoweb.png" alt="" width={220} height={120} className="h-14 w-auto max-w-[130px] object-contain" priority />
        </Link>
      </header>
      <main id="main-content" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 focus:outline-none sm:items-center sm:pt-0">
        <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-card sm:p-8">{children}</div>
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-muted-foreground">
        UP Board · ชุมชนมหาวิทยาลัยพะเยา
      </footer>
    </div>
  );
}
