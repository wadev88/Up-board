import { describe, expect, it } from "vitest";
import { useForm } from "react-hook-form";
import { fireEvent, render, screen } from "@testing-library/react";
import { FacultyProgramFields } from "@/features/auth/components/FacultyProgramFields";
import type { Faculty } from "@/types/api";

const prog = (id: number, faculty_id: number, name_th: string) => ({
  id,
  faculty_id,
  code: `P${id}`,
  name_th,
  name_en: null,
  is_active: true,
});
const FACULTIES: Faculty[] = [
  { id: 1, code: "ICT", name_th: "ไอซีที", name_en: null, is_active: true, programs: [prog(11, 1, "วิศวกรรมซอฟต์แวร์"), prog(12, 1, "เทคโนโลยีสารสนเทศ")] },
  { id: 2, code: "MED", name_th: "แพทยศาสตร์", name_en: null, is_active: true, programs: [prog(21, 2, "แพทยศาสตรบัณฑิต")] },
];

function Harness({ faculty, program }: { faculty: number; program: number }) {
  const form = useForm({ defaultValues: { faculty_id: faculty, program_id: program } });
  return <FacultyProgramFields form={form} faculties={FACULTIES} idPrefix="t" />;
}

const programOptions = () =>
  Array.from((screen.getByLabelText(/สาขาวิชา/) as HTMLSelectElement).options)
    .map((o) => Number(o.value))
    .filter(Boolean);

describe("FacultyProgramFields", () => {
  it("lists only the programs of the chosen faculty", () => {
    render(<Harness faculty={1} program={11} />);
    expect(programOptions()).toEqual([11, 12]);
    expect((screen.getByLabelText(/สาขาวิชา/) as HTMLSelectElement).value).toBe("11");
  });

  it("clears the program when switching to another faculty", () => {
    render(<Harness faculty={1} program={11} />);
    fireEvent.change(screen.getByLabelText(/คณะ/), { target: { value: "2" } });
    expect(programOptions()).toEqual([21]);
    expect((screen.getByLabelText(/สาขาวิชา/) as HTMLSelectElement).value).toBe("0");
  });

  it("disables the program select until a faculty is chosen", () => {
    render(<Harness faculty={0} program={0} />);
    expect(screen.getByLabelText(/สาขาวิชา/)).toBeDisabled();
  });
});

describe("FacultyProgramFields errors", () => {
  it("shows a validation error set after the first render", async () => {
    function WithError() {
      const form = useForm({ defaultValues: { faculty_id: 1, program_id: 0 } });
      return (
        <>
          <FacultyProgramFields form={form} faculties={FACULTIES} idPrefix="e" />
          <button type="button" onClick={() => form.setError("program_id", { message: "กรุณาเลือกสาขาวิชา" })}>
            validate
          </button>
        </>
      );
    }
    render(<WithError />);
    fireEvent.click(screen.getByRole("button", { name: "validate" }));
    expect(await screen.findByText("กรุณาเลือกสาขาวิชา")).toBeInTheDocument();
  });
});

describe("FacultyProgramFields admin-only faculty", () => {
  const CENTRAL: Faculty = {
    id: 9,
    code: "CENTRAL",
    name_th: "ส่วนกลางมหาวิทยาลัย",
    name_en: null,
    is_active: true,
    admin_only: true,
    programs: [prog(91, 9, "บุคลากรส่วนกลาง")],
  };
  const facultyOptions = () =>
    Array.from((screen.getByLabelText(/คณะ/) as HTMLSelectElement).options)
      .map((o) => Number(o.value))
      .filter(Boolean);

  function WithList({ list }: { list: Faculty[] }) {
    const form = useForm({ defaultValues: { faculty_id: 0, program_id: 0 } });
    return <FacultyProgramFields form={form} faculties={list} idPrefix="a" />;
  }

  it("hides an admin-only faculty from the self-service pickers", () => {
    render(<WithList list={[...FACULTIES, CENTRAL]} />);
    expect(facultyOptions()).toEqual([1, 2]);
  });

  it("offers it to admin forms (allowAdminOnly)", () => {
    function AdminList() {
      const form = useForm({ defaultValues: { faculty_id: 0, program_id: 0 } });
      return <FacultyProgramFields form={form} faculties={[...FACULTIES, CENTRAL]} idPrefix="b" allowAdminOnly />;
    }
    render(<AdminList />);
    expect(facultyOptions()).toEqual([1, 2, 9]);
  });
});
