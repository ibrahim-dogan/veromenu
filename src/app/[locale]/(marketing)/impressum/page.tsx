import { legalMetadata, renderLegalPage } from "@/components/marketing/legal/route";
import { impressumSections } from "@/components/marketing/legal/content/impressum";

export const generateMetadata = (props: PageProps<"/[locale]/impressum">) => legalMetadata(props, "impressum", "/impressum");

export default function ImpressumPage(props: PageProps<"/[locale]/impressum">) {
  return renderLegalPage(props, "impressum", impressumSections);
}
