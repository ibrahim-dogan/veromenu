import { legalMetadata, renderLegalPage } from "@/components/marketing/legal/route";
import { agbSections } from "@/components/marketing/legal/content/agb";

export const generateMetadata = (props: PageProps<"/[locale]/agb">) => legalMetadata(props, "agb", "/agb");

export default function AgbPage(props: PageProps<"/[locale]/agb">) {
  return renderLegalPage(props, "agb", agbSections);
}
