import { legalMetadata, renderLegalPage } from "@/components/marketing/legal/route";
import { avvSections } from "@/components/marketing/legal/content/avv";

export const generateMetadata = (props: PageProps<"/[locale]/avv">) => legalMetadata(props, "avv", "/avv");

export default function AvvPage(props: PageProps<"/[locale]/avv">) {
  return renderLegalPage(props, "avv", avvSections);
}
