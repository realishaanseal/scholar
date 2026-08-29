import PageHeading from "@/components/PageHeading";
import LmsImport from "@/components/LmsImport";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div>
      <PageHeading
        title="Import"
        subtitle="Bring in assignments from your school's LMS or a pasted notice."
      />
      <LmsImport />
    </div>
  );
}
