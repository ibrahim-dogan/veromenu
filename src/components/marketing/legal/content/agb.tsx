import { Link } from "@/core/i18n/navigation";
import { PLANS } from "@/modules/billing/plans";
import { formatPrice } from "@/core/utils";
import type { Operator } from "../operator";
import { Callout, Email, Val, type LegalSection } from "../ui";

const PLAN_NAMES: Record<string, string> = { free: "Free", starter: "Starter", pro: "Pro" };

/** Allgemeine Geschäftsbedingungen (B2B SaaS). Legally binding German text. */
export function agbSections(op: Operator): LegalSection[] {
  return [
    {
      id: "geltung",
      heading: "§ 1 Geltungsbereich",
      content: (
        <>
          <p>
            (1) Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für alle Verträge über die Nutzung der Software-as-a-Service-
            Plattform „VeroMenu“ (nachfolgend „Dienst“) zwischen <Val value={op.name} name="LEGAL_NAME" /> (nachfolgend „Anbieter“)
            und dem Kunden.
          </p>
          <p>
            (2) Das Angebot richtet sich ausschließlich an Unternehmer im Sinne des § 14 BGB, juristische Personen des öffentlichen
            Rechts und öffentlich-rechtliche Sondervermögen, insbesondere an Gastronomiebetriebe. Verträge mit Verbrauchern
            (§ 13 BGB) werden nicht geschlossen.
          </p>
          <p>
            (3) Abweichende oder ergänzende Geschäftsbedingungen des Kunden werden nicht Vertragsbestandteil, auch wenn der Anbieter
            ihnen nicht ausdrücklich widerspricht.
          </p>
        </>
      ),
    },
    {
      id: "vertragsschluss",
      heading: "§ 2 Vertragsschluss",
      content: (
        <>
          <p>
            (1) Die Darstellung des Dienstes auf der Website ist kein verbindliches Angebot. Mit Abschluss der Registrierung gibt
            der Kunde ein Angebot auf Abschluss eines Nutzungsvertrags im Tarif „Free“ ab; der Vertrag kommt mit der Freischaltung
            des Kundenkontos zustande.
          </p>
          <p>
            (2) Der Wechsel in einen kostenpflichtigen Tarif erfolgt durch Bestellung im Kundenkonto oder durch gesonderte
            Vereinbarung in Textform. Der Kunde versichert, bei Registrierung als Unternehmer zu handeln und wahrheitsgemäße
            Angaben zu machen.
          </p>
        </>
      ),
    },
    {
      id: "leistungen",
      heading: "§ 3 Leistungen des Anbieters",
      content: (
        <>
          <p>
            (1) Der Anbieter stellt dem Kunden über das Internet eine Software zur Erstellung, Übersetzung und Veröffentlichung
            digitaler Speisekarten bereit, die Gäste per QR-Code im Browser aufrufen. Je nach Tarif umfasst der Dienst insbesondere
            mehrsprachige Speisekarten, Allergen- und Zusatzstoffkennzeichnung, Tisch-QR-Codes, Bestellungen über die Speisekarte,
            Statistiken, Teamverwaltung und KI-gestützte Funktionen.
          </p>
          <p>
            (2) Der konkrete Funktionsumfang und die Mengengrenzen (z. B. Anzahl der Speisekarten, Gerichte, Sprachen, Tische,
            Nutzer und KI-Credits) ergeben sich aus der bei Vertragsschluss gültigen Tarifbeschreibung auf der Website.
          </p>
          <p>
            (3) Der Anbieter darf den Dienst weiterentwickeln und dabei Funktionen ändern, sofern der vertraglich vereinbarte
            Kernumfang nicht wesentlich eingeschränkt wird und die Änderung für den Kunden zumutbar ist.
          </p>
        </>
      ),
    },
    {
      id: "tarife",
      heading: "§ 4 Tarife und Preise",
      content: (
        <>
          <p>(1) Es gelten folgende monatliche Tarife:</p>
          <ul>
            {PLANS.map((p) => (
              <li key={p.id}>
                <strong>{PLAN_NAMES[p.id] ?? p.id}</strong>:{" "}
                {p.priceMonthlyCents === 0 ? "kostenlos" : `${formatPrice(p.priceMonthlyCents)} pro Monat`} – bis zu{" "}
                {p.limits.items} Gerichte, {p.limits.locales} Sprachen, {p.limits.users} Nutzer, {p.limits.aiCredits} KI-Credits pro
                Monat
              </li>
            ))}
          </ul>
          <p>
            (2) Die auf der Website angegebenen Preise enthalten die gesetzliche Umsatzsteuer. Rechnungen weisen den Nettobetrag
            und die Umsatzsteuer gesondert aus.
          </p>
          <p>
            (3) Der Anbieter kann die Preise mit einer Ankündigungsfrist von sechs Wochen zum Beginn eines Abrechnungszeitraums
            anpassen. Der Kunde kann in diesem Fall zum Zeitpunkt des Inkrafttretens der Preisänderung kündigen; hierauf weist der
            Anbieter in der Ankündigung hin.
          </p>
        </>
      ),
    },
    {
      id: "zahlung-laufzeit",
      heading: "§ 5 Zahlung, Laufzeit und Kündigung",
      content: (
        <>
          <p>
            (1) Kostenpflichtige Tarife werden monatlich im Voraus abgerechnet. Rechnungen sind innerhalb von 14 Tagen nach Zugang
            ohne Abzug zahlbar.
          </p>
          <p>
            (2) Kostenpflichtige Tarife laufen auf unbestimmte Zeit und können von beiden Parteien mit Wirkung zum Ende des
            jeweiligen Abrechnungsmonats gekündigt werden. Der Tarif „Free“ läuft unbefristet und kann jederzeit gekündigt werden.
          </p>
          <p>
            (3) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt. Ein wichtiger Grund liegt für den
            Anbieter insbesondere vor, wenn der Kunde mit der Zahlung von mehr als zwei Monatsentgelten in Verzug ist oder den Dienst
            wiederholt rechtswidrig nutzt.
          </p>
          <p>(4) Kündigungen bedürfen der Textform (z. B. E-Mail an <Email value={op.email} />) oder erfolgen über das Kundenkonto.</p>
        </>
      ),
    },
    {
      id: "pflichten",
      heading: "§ 6 Pflichten des Kunden",
      content: (
        <>
          <p>(1) Der Kunde ist für sämtliche Inhalte verantwortlich, die er über den Dienst veröffentlicht. Er stellt insbesondere sicher, dass</p>
          <ul>
            <li>Preise den Vorgaben der Preisangabenverordnung (PAngV) entsprechen, insbesondere als Endpreise angegeben sind,</li>
            <li>
              Allergene und Zusatzstoffe nach der Lebensmittelinformationsverordnung (LMIV), der Lebensmittelinformations-
              Durchführungsverordnung (LMIDV) und den einschlägigen Vorschriften zu Zusatzstoffen korrekt und vollständig angegeben
              sind,
            </li>
            <li>in der Speisekarte eine eigene, vollständige Anbieterkennzeichnung (Impressum) nach § 5 DDG hinterlegt ist,</li>
            <li>er über die erforderlichen Rechte an hochgeladenen Texten, Bildern und Marken verfügt.</li>
          </ul>
          <p>
            (2) Der Kunde hält seine Zugangsdaten geheim, vergibt Teamrollen mit der gebotenen Sorgfalt und informiert den Anbieter
            unverzüglich über einen Verdacht auf Missbrauch.
          </p>
          <p>
            (3) Der Kunde stellt den Anbieter von Ansprüchen Dritter frei, die auf einer rechtswidrigen Nutzung des Dienstes oder auf
            vom Kunden eingestellten Inhalten beruhen, soweit der Kunde dies zu vertreten hat.
          </p>
        </>
      ),
    },
    {
      id: "ki",
      heading: "§ 7 KI-Funktionen",
      content: (
        <>
          <p>
            (1) Der Dienst bietet KI-gestützte Funktionen, insbesondere Übersetzungen mit automatischer Zweitprüfung und
            Rückübersetzung, Vorschläge für Allergene und Zusatzstoffe, den Import von Speisekarten aus Fotos oder PDFs, die
            Generierung von Bildern sowie einen Assistenten, der Änderungen an der Speisekarte vorschlägt.
          </p>
          <p>
            (2) Ergebnisse der KI-Funktionen sind <strong>Vorschläge</strong>. Sie können trotz Prüfmechanismen fehlerhaft,
            unvollständig oder missverständlich sein. Der Kunde ist verpflichtet, sie vor der Veröffentlichung zu prüfen. Änderungen
            durch den Assistenten werden erst nach ausdrücklicher Bestätigung durch den Kunden übernommen.
          </p>
          <Callout>
            <p>
              <strong>Allergen- und Zusatzstoffangaben liegen allein in der Verantwortung des Kunden.</strong> Gästen werden nur
              Angaben angezeigt, die der Kunde bestätigt hat. Der Anbieter übernimmt keine Gewähr für die Richtigkeit KI-gestützter
              Vorschläge; die Prüf- und Kennzeichnungspflichten des Lebensmittelunternehmers bleiben vollständig beim Kunden.
            </p>
          </Callout>
          <p>
            (3) Jeder Tarif enthält ein monatliches Kontingent an KI-Credits. Nicht verbrauchte Credits verfallen am Ende des
            Kalendermonats und werden nicht erstattet. Ist das Kontingent aufgebraucht, stehen KI-Funktionen bis zum Beginn des
            nächsten Monats oder bis zu einem Tarifwechsel nicht zur Verfügung.
          </p>
          <p>
            (4) KI-generierte Bilder werden im Dienst als solche gekennzeichnet. Der Kunde verwendet sie nur so, dass Gäste nicht
            über die tatsächliche Beschaffenheit der Speisen getäuscht werden.
          </p>
        </>
      ),
    },
    {
      id: "verfuegbarkeit",
      heading: "§ 8 Verfügbarkeit und Support",
      content: (
        <>
          <p>
            (1) Der Anbieter gewährleistet eine Verfügbarkeit des Dienstes von 98,5 % im Jahresmittel. Hiervon ausgenommen sind
            angekündigte Wartungsfenster, Störungen außerhalb des Einflussbereichs des Anbieters (z. B. höhere Gewalt, Störungen
            von Netzen Dritter) sowie Ausfälle von KI-Drittanbietern, deren Funktionen nicht zum Kern der Speisekarte gehören.
          </p>
          <p>
            (2) Support erfolgt per E-Mail an Werktagen (Montag bis Freitag, ausgenommen bundeseinheitliche Feiertage) zu den
            üblichen Geschäftszeiten.
          </p>
        </>
      ),
    },
    {
      id: "datenschutz",
      heading: "§ 9 Datenschutz und Auftragsverarbeitung",
      content: (
        <p>
          Soweit der Anbieter personenbezogene Daten im Auftrag des Kunden verarbeitet (insbesondere Bestelldaten von Gästen und
          Daten von Teammitgliedern), schließen die Parteien einen Vertrag über die Auftragsverarbeitung nach Art. 28 DSGVO. Der{" "}
          <Link href="/avv">Auftragsverarbeitungsvertrag</Link> ist Bestandteil dieses Vertrags. Im Übrigen gilt die{" "}
          <Link href="/datenschutz">Datenschutzerklärung</Link>.
        </p>
      ),
    },
    {
      id: "nutzungsrechte",
      heading: "§ 10 Nutzungsrechte",
      content: (
        <>
          <p>
            (1) Der Anbieter räumt dem Kunden für die Vertragslaufzeit das einfache, nicht übertragbare Recht ein, den Dienst
            bestimmungsgemäß zu nutzen.
          </p>
          <p>
            (2) Der Kunde räumt dem Anbieter die zur Erbringung des Dienstes erforderlichen Rechte an seinen Inhalten ein,
            insbesondere zur Speicherung, Übersetzung, Bearbeitung durch KI-Funktionen und öffentlichen Zugänglichmachung über die
            Speisekarte. Der Anbieter nutzt Kundeninhalte nicht zum Training eigener KI-Modelle.
          </p>
        </>
      ),
    },
    {
      id: "haftung",
      heading: "§ 11 Haftung",
      content: (
        <>
          <p>
            (1) Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder
            Gesundheit, nach dem Produkthaftungsgesetz sowie im Umfang einer übernommenen Garantie.
          </p>
          <p>
            (2) Bei leichter Fahrlässigkeit haftet der Anbieter nur bei Verletzung einer wesentlichen Vertragspflicht
            (Kardinalpflicht), deren Erfüllung die ordnungsgemäße Durchführung des Vertrags überhaupt erst ermöglicht und auf deren
            Einhaltung der Kunde regelmäßig vertrauen darf. In diesem Fall ist die Haftung auf den vertragstypischen, vorhersehbaren
            Schaden begrenzt, höchstens jedoch auf die Summe der vom Kunden in den zwölf Monaten vor dem schadensbegründenden
            Ereignis gezahlten Entgelte.
          </p>
          <p>
            (3) Für den Verlust von Daten haftet der Anbieter nur in Höhe des Aufwands, der bei ordnungsgemäßer und regelmäßiger
            Datensicherung durch den Kunden zur Wiederherstellung erforderlich gewesen wäre.
          </p>
          <p>
            (4) Der Anbieter haftet nicht für die inhaltliche Richtigkeit von KI-Ergebnissen (§ 7), insbesondere nicht für
            Allergen- und Zusatzstoffangaben, Übersetzungen oder Preise, die der Kunde veröffentlicht hat.
          </p>
          <p>(5) Die vorstehenden Beschränkungen gelten auch zugunsten der Erfüllungsgehilfen und gesetzlichen Vertreter des Anbieters.</p>
        </>
      ),
    },
    {
      id: "sperrung",
      heading: "§ 12 Sperrung",
      content: (
        <p>
          Der Anbieter kann den Zugang des Kunden oder einzelne Speisekarten vorübergehend sperren, wenn konkrete Anhaltspunkte
          für eine rechtswidrige Nutzung oder eine Gefährdung der Sicherheit des Dienstes bestehen oder der Kunde mit der Zahlung
          von mindestens zwei Monatsentgelten in Verzug ist. Der Anbieter berücksichtigt dabei die berechtigten Interessen des
          Kunden, informiert ihn unverzüglich und hebt die Sperrung auf, sobald der Grund entfallen ist.
        </p>
      ),
    },
    {
      id: "vertragsende",
      heading: "§ 13 Vertragsende, Datenexport und Löschung",
      content: (
        <p>
          Der Kunde kann seine Inhalte bis zum Vertragsende exportieren. Nach Vertragsende werden die Speisekarten des Kunden offline genommen
          und sämtliche Kundendaten innerhalb von 30 Tagen gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten
          entgegenstehen. Auf Wunsch stellt der Anbieter dem Kunden die Daten vor der Löschung in einem gängigen
          maschinenlesbaren Format zur Verfügung.
        </p>
      ),
    },
    {
      id: "aenderungen",
      heading: "§ 14 Änderungen der AGB",
      content: (
        <p>
          Der Anbieter kann diese AGB mit Wirkung für die Zukunft ändern, soweit dies aus triftigem Grund (z. B. geänderte
          Rechtslage, neue Funktionen) erforderlich und für den Kunden zumutbar ist. Änderungen werden mindestens sechs Wochen vor
          Inkrafttreten in Textform angekündigt. Widerspricht der Kunde nicht innerhalb dieser Frist, gelten die Änderungen als
          angenommen. Auf das Widerspruchsrecht, die Frist und die Folgen des Schweigens weist der Anbieter in der Ankündigung
          gesondert hin. Im Fall des Widerspruchs können beide Parteien den Vertrag zum Zeitpunkt des Inkrafttretens kündigen.
        </p>
      ),
    },
    {
      id: "schlussbestimmungen",
      heading: "§ 15 Schlussbestimmungen",
      content: (
        <>
          <p>(1) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts (CISG).</p>
          <p>
            (2) Ist der Kunde Kaufmann, juristische Person des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen, ist
            ausschließlicher Gerichtsstand für alle Streitigkeiten aus diesem Vertrag Hamburg bzw. der Sitz des Anbieters.
          </p>
          <p>
            (3) Sollten einzelne Bestimmungen dieser AGB unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen
            unberührt. An die Stelle der unwirksamen Bestimmung tritt die gesetzliche Regelung.
          </p>
        </>
      ),
    },
  ];
}
