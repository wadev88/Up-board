import { api } from "@/services/apiClient";
import type { UploadResponse } from "@/types/api";
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/constants";

/** POST /uploads (multipart field `file`). */
export function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  return api.post<UploadResponse>("/uploads", form);
}

/** Client-side pre-check (the backend re-validates using magic bytes). */
export function validateImageFile(file: File): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP";
  }
  if (file.size > MAX_UPLOAD_BYTES) return "ไฟล์มีขนาดเกิน 5 MB";
  return null;
}
