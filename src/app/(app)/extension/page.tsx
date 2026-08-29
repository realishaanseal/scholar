import PageHeading from "@/components/PageHeading";
import ExtensionSetup from "@/components/ExtensionSetup";

export const dynamic = "force-dynamic";

export default function ExtensionPage() {
  return (
    <div>
      <PageHeading
        title="Browser extension"
        subtitle="Send assignments straight from any page on the web."
      />
      <ExtensionSetup />
    </div>
  );
}
