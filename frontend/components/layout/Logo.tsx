import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/dashboard"
      className={cn("inline-flex min-h-12 shrink-0 items-center rounded-xl", className)}
      aria-label="UP Board หน้าแรก"
    >
      <Image src="/logoweb.png" alt="" width={220} height={120} className="h-14 w-auto max-w-[130px] object-contain" priority />
    </Link>
  );
}
