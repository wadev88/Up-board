"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { LoadErrorState } from "@/components/common/LoadErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { parsePositiveId } from "@/lib/utils";
import { useFaculties } from "@/features/auth/hooks";
import { PostListSkeleton } from "@/features/posts/components/PostCard";
import { PostsBrowser } from "@/features/posts/components/PostsBrowser";

/** /faculty/[id] — posts from one faculty. An invalid id never reaches the API. */
export function FacultyFeed() {
  const { id } = useParams<{ id: string }>();
  const facultyId = parsePositiveId(id);
  const faculties = useFaculties();
  const faculty = facultyId === null ? undefined : faculties.data?.find((f) => f.id === facultyId);
  const unknownFaculty = facultyId !== null && faculties.isSuccess && !faculty;

  if (facultyId === null || unknownFaculty) {
    return <LoadErrorState notFound notFoundTitle="ไม่พบคณะนี้" backHref="/posts" backLabel="โพสต์ทั้งหมด" />;
  }

  return (
    <div>
      <PageHeader
        title={faculty?.name_th ?? "ฟีดคณะ"}
        description={faculty?.name_en ?? "โพสต์ทั้งหมดจากคณะนี้"}
      />
      <Suspense fallback={<PostListSkeleton count={4} />}>
        <PostsBrowser facultyId={facultyId} />
      </Suspense>
    </div>
  );
}
