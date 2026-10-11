"use client";

import type { FieldValues, Path, PathValue, UseFormReturn } from "react-hook-form";
import { useFormState, useWatch } from "react-hook-form";
import { FormField, fieldDescribedBy } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import type { Faculty, Program } from "@/types/api";

interface Values extends FieldValues {
  faculty_id: number;
  program_id: number;
}

/**
 * Faculty (คณะ) + program (สาขาวิชา). The program list follows the chosen faculty; switching
 * faculty clears a program that belongs to another one. The API enforces the same rule.
 * `currentProgram` keeps a since-retired program selectable for the user that already has it.
 */
export function FacultyProgramFields<T extends Values>({
  form,
  faculties,
  idPrefix,
  requiredFaculty = true,
  requiredProgram = true,
  noFacultyLabel = "เลือกคณะ",
  noProgramLabel = "เลือกสาขาวิชา",
  facultyHint,
  currentProgram,
  allowAdminOnly = false,
}: {
  form: UseFormReturn<T>;
  faculties: Faculty[] | undefined;
  idPrefix: string;
  requiredFaculty?: boolean;
  requiredProgram?: boolean;
  noFacultyLabel?: string;
  noProgramLabel?: string;
  facultyHint?: string;
  currentProgram?: Program | null;
  /** admin forms only: also offer admin-only faculties (university central / facilities) */
  allowAdminOnly?: boolean;
}) {
  const options = allowAdminOnly ? faculties : faculties?.filter((f) => !f.admin_only);
  const facultyName = "faculty_id" as Path<T>;
  const programName = "program_id" as Path<T>;
  const facultyId = useWatch({ control: form.control, name: facultyName }) as number;
  const faculty = options?.find((f) => f.id === facultyId);
  const programs: Program[] = [...(faculty?.programs ?? [])];
  if (currentProgram && currentProgram.faculty_id === facultyId && !programs.some((p) => p.id === currentProgram.id)) {
    programs.push(currentProgram);
  }
  // subscribe explicitly: the React Compiler memoizes this component, so reading form.formState
  // from the parent's render would never show new errors
  const { errors } = useFormState({ control: form.control });
  const facultyError = errors.faculty_id?.message as string | undefined;
  const programError = errors.program_id?.message as string | undefined;
  const facultyField = form.register(facultyName, { valueAsNumber: true });
  const programField = form.register(programName, { valueAsNumber: true });

  return (
    <>
      <FormField
        id={`${idPrefix}-faculty`}
        label="คณะ"
        required={requiredFaculty}
        error={facultyError}
        hint={facultyHint}
      >
        <Select
          // remount once the options arrive so the current faculty sticks
          key={faculties ? "ready" : "loading"}
          id={`${idPrefix}-faculty`}
          aria-invalid={!!facultyError || undefined}
          aria-describedby={fieldDescribedBy(`${idPrefix}-faculty`, facultyError, !!facultyHint)}
          disabled={!faculties}
          {...facultyField}
          onChange={(e) => {
            void facultyField.onChange(e);
            const next = options?.find((f) => f.id === Number(e.target.value));
            const programId = form.getValues(programName) as number;
            if (programId && !next?.programs?.some((p) => p.id === programId)) {
              form.setValue(programName, 0 as PathValue<T, Path<T>>, { shouldDirty: true });
            }
          }}
        >
          <option value={0}>{faculties ? noFacultyLabel : "กำลังโหลด…"}</option>
          {options?.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name_th}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        id={`${idPrefix}-program`}
        label="สาขาวิชา"
        required={requiredProgram}
        error={programError}
        hint={!faculty ? "เลือกคณะก่อน แล้วจึงเลือกสาขาวิชา" : undefined}
      >
        <Select
          // remount when the option list changes so the selected value is re-applied
          key={`${faculties ? "ready" : "loading"}-${facultyId}`}
          id={`${idPrefix}-program`}
          aria-invalid={!!programError || undefined}
          aria-describedby={fieldDescribedBy(`${idPrefix}-program`, programError, !faculty)}
          disabled={!faculty}
          {...programField}
        >
          <option value={0}>{noProgramLabel}</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name_th}
              {p.is_active ? "" : " (ปิดใช้งาน)"}
            </option>
          ))}
        </Select>
      </FormField>
    </>
  );
}
