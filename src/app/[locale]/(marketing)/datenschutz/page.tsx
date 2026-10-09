import { legalMetadata, renderLegalPage } from "@/components/marketing/legal/route";
import { datenschutzSections } from "@/components/marketing/legal/content/datenschutz";

export const generateMetadata = (props: PageProps<"/[locale]/datenschutz">) => legalMetadata(props, "datenschutz", "/datenschutz");

export default function DatenschutzPage(props: PageProps<"/[locale]/datenschutz">) {
  return renderLegalPage(props, "datenschutz", datenschutzSections);
}
