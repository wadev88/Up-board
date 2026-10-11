"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PostTypePicker } from "@/features/posts/components/PostTypePicker";

/** Small "เปลี่ยนประเภท" link on the creation forms; reopens the post type popup. */
export function ChangeTypeButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="link" size="sm" className="h-auto min-h-0 p-0" onClick={() => setOpen(true)}>
        เปลี่ยนประเภท
      </Button>
      <PostTypePicker open={open} onOpenChange={setOpen} />
    </>
  );
}
