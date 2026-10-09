import type { Operator } from "../operator";
import { AddressBlock, Email, InfoRows, Val, type LegalSection } from "../ui";

/** Impressum nach § 5 DDG. Legally binding German text. */
export function impressumSections(op: Operator): LegalSection[] {
  const sections: LegalSection[] = [
    {
      id: "anbieter",
      heading: "Angaben gemäß § 5 DDG",
      content: (
        <>
          <p className="font-semibold text-stone-900">
            <Val value={op.name} name="LEGAL_NAME" />
          </p>
          <AddressBlock lines={op.address} name="LEGAL_ADDRESS" />
        </>
      ),
    },
  ];

  if (op.representative) {
    sections.push({
      id: "vertretung",
      heading: "Vertreten durch",
      content: <p>{op.representative}</p>,
    });
  }

  sections.push({
    id: "kontakt",
    heading: "Kontakt",
    content: (
      <InfoRows
        rows={[
          { label: "Telefon", value: <Val value={op.phone} name="LEGAL_PHONE" /> },
          { label: "E-Mail", value: <Email value={op.email} /> },
        ]}
      />
    ),
  });

  if (op.register) {
    sections.push({
      id: "register",
      heading: "Registereintrag",
      content: <p>{op.register}</p>,
    });
  }

  sections.push(
    {
      id: "umsatzsteuer",
      heading: "Umsatzsteuer-ID",
      content: (
        <p>
          Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: <Val value={op.vatId} name="LEGAL_VAT_ID" />
        </p>
      ),
    },
    {
      id: "verantwortlich",
      heading: "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV",
      content: (
        <>
          <p className="font-medium text-stone-900">
            {op.representative ? op.representative : <Val value={op.name} name="LEGAL_NAME" />}
          </p>
          <AddressBlock lines={op.address} name="LEGAL_ADDRESS" />
        </>
      ),
    },
    {
      id: "streitbeilegung",
      heading: "Verbraucherstreitbeilegung",
      content: (
        <>
          <p>
            Unser Angebot richtet sich ausschließlich an Unternehmer im Sinne des § 14 BGB. Wir sind weder bereit noch verpflichtet,
            an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen (§ 36 VSBG).
          </p>
          <p>
            Die Plattform der Europäischen Kommission zur Online-Streitbeilegung (OS-Plattform) wurde mit Wirkung zum 20. Juli 2025
            eingestellt; ein Hinweis darauf ist daher nicht mehr erforderlich.
          </p>
        </>
      ),
    },
    {
      id: "speisekarten",
      heading: "Speisekarten der Gastronomiebetriebe",
      content: (
        <p>
          Die über VeroMenu veröffentlichten Speisekarten (Adressen unterhalb von <code>/m/…</code>) sind Inhalte der jeweiligen
          Gastronomiebetriebe. Für Speisen, Preise, Allergen- und Zusatzstoffangaben sowie das Impressum dieser Speisekarten ist
          der jeweilige Betrieb verantwortlich; seine Anbieterkennzeichnung ist direkt in der Speisekarte abrufbar.
        </p>
      ),
    },
    {
      id: "haftung-inhalte",
      heading: "Haftung für Inhalte",
      content: (
        <p>
          Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach
          §§ 7 bis 10 DDG sind wir jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder
          nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der
          Nutzung von Informationen nach den allgemeinen Gesetzen bleiben unberührt. Eine Haftung ist erst ab dem Zeitpunkt der
          Kenntnis einer konkreten Rechtsverletzung möglich; bei Bekanntwerden entsprechender Rechtsverletzungen entfernen wir diese
          Inhalte umgehend.
        </p>
      ),
    },
    {
      id: "haftung-links",
      heading: "Haftung für Links",
      content: (
        <p>
          Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Für diese fremden
          Inhalte ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich. Die verlinkten Seiten wurden zum Zeitpunkt
          der Verlinkung auf mögliche Rechtsverstöße überprüft; rechtswidrige Inhalte waren nicht erkennbar. Eine permanente
          inhaltliche Kontrolle ist ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von
          Rechtsverletzungen entfernen wir derartige Links umgehend.
        </p>
      ),
    },
    {
      id: "urheberrecht",
      heading: "Urheberrecht",
      content: (
        <p>
          Die durch uns erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Vervielfältigung,
          Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts bedürfen der schriftlichen
          Zustimmung des jeweiligen Autors bzw. Erstellers. Inhalte Dritter – insbesondere die Speisekarten, Texte und Bilder der
          Gastronomiebetriebe – sind als solche gekennzeichnet bzw. dem jeweiligen Betrieb zugeordnet.
        </p>
      ),
    },
  );

  return sections;
}
