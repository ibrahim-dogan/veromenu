import type { Operator } from "../operator";
import { Link } from "@/core/i18n/navigation";
import { AddressBlock, Callout, Email, InfoRows, Val, type LegalSection } from "../ui";

/** Datenschutzerklärung (DSGVO / BDSG / TDDDG). Legally binding German text. */
export function datenschutzSections(op: Operator): LegalSection[] {
  return [
    {
      id: "verantwortlicher",
      heading: "1. Verantwortlicher",
      content: (
        <>
          <p>Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) für die Website und die Plattform VeroMenu ist:</p>
          <p className="font-semibold text-stone-900">
            <Val value={op.name} name="LEGAL_NAME" />
          </p>
          <AddressBlock lines={op.address} name="LEGAL_ADDRESS" />
          <InfoRows
            rows={[
              { label: "E-Mail", value: <Email value={op.email} /> },
              { label: "Telefon", value: <Val value={op.phone} name="LEGAL_PHONE" /> },
            ]}
          />
          <p>
            Sofern ein Datenschutzbeauftragter benannt ist, erreichen Sie ihn unter der oben genannten Anschrift mit dem Zusatz
            „z. Hd. Datenschutzbeauftragter“ oder per E-Mail.
          </p>
        </>
      ),
    },
    {
      id: "ueberblick",
      heading: "2. Überblick",
      content: (
        <>
          <p>
            VeroMenu ist eine Software für digitale QR-Speisekarten, die sich an Gastronomiebetriebe richtet. Wir unterscheiden
            zwei Rollen:
          </p>
          <ul>
            <li>
              <strong>Als Verantwortliche</strong> verarbeiten wir Daten von Besucherinnen und Besuchern dieser Website sowie von
              Kundinnen und Kunden (Gastronomiebetriebe und deren Teammitglieder), die ein Konto bei uns führen.
            </li>
            <li>
              <strong>Als Auftragsverarbeiter</strong> verarbeiten wir Daten der Gäste eines Restaurants (z. B. Bestellungen über die
              Speisekarte) im Auftrag des jeweiligen Betriebs. Verantwortlich ist dann der Betrieb; Grundlage ist ein
              Auftragsverarbeitungsvertrag nach Art. 28 DSGVO (siehe <Link href="/avv">AV-Vertrag</Link>).
            </li>
          </ul>
          <p>
            Wir verwenden keine Tracking- oder Marketing-Cookies, keine Analyse- oder Werbedienste Dritter und binden keine externen
            Schriftarten oder Content-Delivery-Networks ein.
          </p>
        </>
      ),
    },
    {
      id: "hosting",
      heading: "3. Hosting",
      content: (
        <>
          <p>Website, Plattform und Datenbank werden auf Servern in Deutschland betrieben. Hosting-Anbieter ist:</p>
          <AddressBlock lines={op.hoster} />
          <p>
            Der Hosting-Anbieter verarbeitet die Daten ausschließlich in unserem Auftrag und nach unseren Weisungen (Art. 28 DSGVO).
            Rechtsgrundlage ist unser berechtigtes Interesse an einer sicheren und zuverlässigen Bereitstellung unseres Angebots
            (Art. 6 Abs. 1 lit. f DSGVO) bzw. die Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).
          </p>
        </>
      ),
    },
    {
      id: "server-logs",
      heading: "4. Server-Logfiles",
      content: (
        <>
          <p>Bei jedem Aufruf unserer Seiten werden technisch notwendige Informationen in Server-Logfiles gespeichert:</p>
          <ul>
            <li>IP-Adresse des anfragenden Geräts,</li>
            <li>Datum und Uhrzeit des Zugriffs,</li>
            <li>aufgerufene Adresse (URL) und HTTP-Statuscode,</li>
            <li>übertragene Datenmenge, Referrer-URL sowie Browsertyp und -version (User-Agent).</li>
          </ul>
          <p>
            Die Verarbeitung dient der Auslieferung der Website, der Gewährleistung der Systemsicherheit (z. B. Abwehr von Angriffen)
            und der Fehleranalyse. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Die Logfiles werden nach spätestens 14 Tagen
            gelöscht, sofern sie nicht im Einzelfall zur Aufklärung eines Sicherheitsvorfalls länger benötigt werden.
          </p>
        </>
      ),
    },
    {
      id: "cookies",
      heading: "5. Cookies und lokale Speicherung",
      content: (
        <>
          <p>Wir setzen ausschließlich technisch notwendige Cookies ein:</p>
          <ul>
            <li>
              <strong>vm_session</strong> – Sitzungs-Cookie nach dem Login (httpOnly, verschlüsselte Verbindung, Laufzeit bis zu
              30 Tage oder bis zur Abmeldung). Es enthält lediglich eine zufällige Kennung; die Sitzung selbst wird serverseitig
              verwaltet.
            </li>
            <li>
              <strong>vm_locale</strong> – speichert die gewählte Sprache der Benutzeroberfläche (Laufzeit 12 Monate).
            </li>
          </ul>
          <p>
            Die Speicherung ist für die von Ihnen ausdrücklich gewünschten Funktionen unbedingt erforderlich und daher nach § 25
            Abs. 2 Nr. 2 TDDDG ohne Einwilligung zulässig. Die anschließende Verarbeitung beruht auf Art. 6 Abs. 1 lit. b bzw. lit. f
            DSGVO. Soweit die Bestellfunktion einer Speisekarte genutzt wird, kann der Warenkorb lokal in Ihrem Browser gespeichert
            werden; auch dies ist technisch erforderlich. Tracking-, Analyse- oder Marketing-Cookies setzen wir nicht ein – deshalb
            gibt es kein Cookie-Banner.
          </p>
        </>
      ),
    },
    {
      id: "schriften",
      heading: "6. Schriftarten und externe Inhalte",
      content: (
        <p>
          Alle Schriftarten, Skripte und Grafiken werden von unseren eigenen Servern ausgeliefert. Es findet beim Seitenaufruf keine
          Verbindung zu Servern Dritter (z. B. Google Fonts oder Content-Delivery-Networks) statt.
        </p>
      ),
    },
    {
      id: "kundenkonto",
      heading: "7. Registrierung und Kundenkonto",
      content: (
        <>
          <p>
            Für die Nutzung von VeroMenu ist ein Kundenkonto erforderlich. Dabei verarbeiten wir Name, E-Mail-Adresse, ein
            Passwort (ausschließlich als Argon2id-Hash gespeichert), die bevorzugte Sprache, den Namen des Betriebs sowie die von
            Ihnen eingegebenen Inhalte (Speisekarte, Bilder, Betriebs- und Impressumsangaben, Tische, Teamrollen). Zur Sicherheit
            protokollieren wir wesentliche Änderungen (Audit-Log) und den Zeitpunkt der letzten Anmeldung.
          </p>
          <p>
            Rechtsgrundlage ist die Erfüllung des Vertrags bzw. vorvertraglicher Maßnahmen (Art. 6 Abs. 1 lit. b DSGVO) sowie unser
            berechtigtes Interesse an der Sicherheit der Plattform (Art. 6 Abs. 1 lit. f DSGVO). Für Teammitglieder, die ein Betrieb
            einlädt, gilt dasselbe; die Einladung erfolgt im Auftrag des Betriebs.
          </p>
        </>
      ),
    },
    {
      id: "e-mail",
      heading: "8. E-Mail-Versand",
      content: (
        <p>
          Wir versenden ausschließlich transaktionale E-Mails, die für die Nutzung erforderlich sind – etwa zur Bestätigung der
          E-Mail-Adresse, zum Zurücksetzen des Passworts oder für Team-Einladungen. Der Versand erfolgt über einen
          E-Mail-Dienstleister (SMTP), der als Auftragsverarbeiter für uns tätig ist. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
          Newsletter versenden wir nicht ohne Ihre ausdrückliche Einwilligung.
        </p>
      ),
    },
    {
      id: "kontaktaufnahme",
      heading: "9. Kontaktaufnahme",
      content: (
        <p>
          Wenn Sie uns per E-Mail oder Telefon kontaktieren, verarbeiten wir Ihre Angaben (Name, Kontaktdaten, Inhalt der Anfrage)
          zur Bearbeitung Ihres Anliegens. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit die Anfrage mit einem Vertrag
          zusammenhängt, im Übrigen unser berechtigtes Interesse an der Beantwortung (Art. 6 Abs. 1 lit. f DSGVO). Die Daten werden
          gelöscht, sobald die Anfrage abschließend bearbeitet ist und keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
        </p>
      ),
    },
    {
      id: "gaeste-statistik",
      heading: "10. Gäste-Speisekarte: cookiefreie Statistik",
      content: (
        <>
          <p>
            Damit Betriebe sehen, wie ihre Speisekarte genutzt wird (z. B. Aufrufe, beliebte Gerichte, gewählte Sprachen), erfassen
            wir beim Aufruf einer Speisekarte anonyme Nutzungsereignisse. Dafür werden <strong>keine Cookies gesetzt und keine
            Daten auf dem Gerät gespeichert</strong>.
          </p>
          <p>
            Um Mehrfachaufrufe desselben Geräts an einem Tag zusammenzufassen, bilden wir aus IP-Adresse, User-Agent, der Kennung
            des Restaurants und einem täglich wechselnden geheimen Zufallswert (Salt) einen kryptografischen Hashwert (SHA-256).
            Der Salt wird täglich ausgetauscht, sodass der Hashwert nicht umkehrbar ist, nicht tagesübergreifend verknüpft werden
            kann und keine Profilbildung ermöglicht. Die IP-Adresse selbst wird dabei nicht gespeichert.
          </p>
          <p>
            Rechtsgrundlage ist unser berechtigtes Interesse und das der Betriebe an einer datensparsamen Reichweitenmessung
            (Art. 6 Abs. 1 lit. f DSGVO). Die Ereignisse werden nach spätestens 24 Monaten gelöscht oder vollständig aggregiert.
          </p>
        </>
      ),
    },
    {
      id: "bestellungen",
      heading: "11. Bestellungen über die Speisekarte",
      content: (
        <p>
          Bietet ein Betrieb Bestellungen über die Speisekarte an, verarbeiten wir die Bestelldaten (Tisch, bestellte Gerichte,
          optionale Anmerkungen, gewählte Sprache, Zeitpunkt) ausschließlich im Auftrag dieses Betriebs. Verantwortlicher für
          diese Verarbeitung ist der jeweilige Betrieb, der Ihnen auch für Auskünfte zur Verfügung steht. Bitte geben Sie in
          Freitextfeldern keine sensiblen Daten an. Ein Gastkonto oder die Angabe von Name und Kontaktdaten ist für Bestellungen
          nicht erforderlich.
        </p>
      ),
    },
    {
      id: "ki",
      heading: "12. KI-Funktionen",
      content: (
        <>
          <p>
            Für Übersetzungen, Allergen- und Zusatzstoffvorschläge, den Import von Speisekarten aus Fotos oder PDFs, die
            Bildgenerierung und den KI-Assistenten übermitteln wir <strong>ausschließlich Inhalte der Speisekarte</strong> – etwa
            Namen, Beschreibungen und Zutaten von Gerichten sowie vom Betrieb hochgeladene Fotos oder PDFs von Speisekarten – an
            folgenden Dienst:
          </p>
          <AddressBlock lines={["OpenRouter, Inc.", "USA"]} />
          <p>
            OpenRouter leitet die Anfragen an das jeweils konfigurierte Sprach- oder Bildmodell weiter; die Modellanbieter können
            ebenfalls in den USA oder anderen Drittländern sitzen. <strong>Personenbezogene Daten von Gästen (z. B. Bestellungen
            oder Statistikdaten) werden nicht an KI-Anbieter übermittelt.</strong> Betriebe werden gebeten, in Speisekarteninhalten
            keine personenbezogenen Daten anzugeben.
          </p>
          <p>
            Rechtsgrundlage ist die Vertragserfüllung gegenüber dem Betrieb (Art. 6 Abs. 1 lit. b DSGVO). Zu Übermittlungen in
            Drittländer siehe Abschnitt 14. Die Ergebnisse der KI sind Vorschläge; sie werden erst nach Prüfung durch den Betrieb
            veröffentlicht. Eine automatisierte Entscheidung im Sinne von Art. 22 DSGVO findet nicht statt.
          </p>
        </>
      ),
    },
    {
      id: "spracheingabe",
      heading: "13. Spracheingabe des KI-Assistenten",
      content: (
        <p>
          Nutzen Sie die Spracheingabe, wird Ihre Aufnahme erst nach Ihrem Klick über das Mikrofon Ihres Geräts erfasst, an unseren
          Server übertragen und zur Umwandlung in Text an den in Abschnitt 12 genannten KI-Dienst übermittelt. Die Audiodatei wird
          nicht länger gespeichert, als für die Transkription erforderlich ist; gespeichert wird nur der erkannte Text als Teil des
          Änderungsvorschlags. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
        </p>
      ),
    },
    {
      id: "drittland",
      heading: "14. Übermittlung in Drittländer",
      content: (
        <p>
          Soweit Daten in die USA übermittelt werden, erfolgt dies auf Grundlage des Angemessenheitsbeschlusses der
          EU-Kommission zum EU-US Data Privacy Framework (Art. 45 DSGVO), sofern der Empfänger danach zertifiziert ist, und im
          Übrigen auf Grundlage der EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO) einschließlich ergänzender
          Maßnahmen. Eine Kopie der Garantien können Sie über die oben genannten Kontaktdaten anfordern.
        </p>
      ),
    },
    {
      id: "zahlung",
      heading: "15. Zahlungsabwicklung",
      content: (
        <p>
          Derzeit erfolgt die Abrechnung kostenpflichtiger Tarife per Rechnung. Wir verarbeiten dafür Rechnungs- und
          Vertragsdaten (Art. 6 Abs. 1 lit. b und lit. c DSGVO). Sollten wir künftig einen Zahlungsdienstleister einsetzen, werden
          wir ihn in dieser Erklärung benennen.
        </p>
      ),
    },
    {
      id: "speicherdauer",
      heading: "16. Speicherdauer",
      content: (
        <p>
          Wir speichern personenbezogene Daten nur so lange, wie es für die genannten Zwecke erforderlich ist. Kontodaten und
          Inhalte werden nach Vertragsende innerhalb von 30 Tagen gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten
          bestehen (insbesondere handels- und steuerrechtlich bis zu zehn Jahre für Rechnungen und Buchungsbelege, §§ 257 HGB,
          147 AO). Sicherungskopien werden im Rahmen des regulären Backup-Zyklus überschrieben.
        </p>
      ),
    },
    {
      id: "rechte",
      heading: "17. Ihre Rechte",
      content: (
        <>
          <p>Sie haben gegenüber uns folgende Rechte hinsichtlich der Sie betreffenden personenbezogenen Daten:</p>
          <ul>
            <li>Auskunft (Art. 15 DSGVO),</li>
            <li>Berichtigung (Art. 16 DSGVO),</li>
            <li>Löschung (Art. 17 DSGVO),</li>
            <li>Einschränkung der Verarbeitung (Art. 18 DSGVO),</li>
            <li>Datenübertragbarkeit (Art. 20 DSGVO),</li>
            <li>Widerruf einer erteilten Einwilligung mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO).</li>
          </ul>
          <Callout>
            <p>
              <strong>Widerspruchsrecht nach Art. 21 DSGVO:</strong> Soweit wir Daten auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO
              verarbeiten, können Sie aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit Widerspruch gegen die
              Verarbeitung einlegen. Wir verarbeiten die Daten dann nicht mehr, es sei denn, wir können zwingende schutzwürdige
              Gründe nachweisen, die Ihre Interessen überwiegen, oder die Verarbeitung dient der Geltendmachung, Ausübung oder
              Verteidigung von Rechtsansprüchen.
            </p>
          </Callout>
          <p>
            Zur Ausübung Ihrer Rechte genügt eine Nachricht an <Email value={op.email} />. Betrifft Ihre Anfrage Daten, die wir im
            Auftrag eines Restaurants verarbeiten (z. B. Bestellungen), leiten wir sie an den verantwortlichen Betrieb weiter.
          </p>
        </>
      ),
    },
    {
      id: "beschwerde",
      heading: "18. Beschwerderecht bei der Aufsichtsbehörde",
      content: (
        <>
          <p>
            Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO), insbesondere in dem
            Mitgliedstaat Ihres Aufenthaltsorts, Ihres Arbeitsplatzes oder des Orts des mutmaßlichen Verstoßes. Die für uns
            zuständige Aufsichtsbehörde ist:
          </p>
          <AddressBlock lines={op.supervisoryAuthority} />
        </>
      ),
    },
    {
      id: "sicherheit",
      heading: "19. Datensicherheit",
      content: (
        <p>
          Die Übertragung erfolgt ausschließlich verschlüsselt über HTTPS (TLS). Passwörter speichern wir nur als Argon2id-Hash,
          hinterlegte API-Schlüssel werden mit AES-256-GCM verschlüsselt. Zugriffe innerhalb eines Betriebs sind über Rollen und
          Berechtigungen beschränkt. Wir passen unsere technischen und organisatorischen Maßnahmen fortlaufend dem Stand der Technik
          an (Art. 32 DSGVO).
        </p>
      ),
    },
    {
      id: "automatisierte-entscheidungen",
      heading: "20. Keine automatisierte Entscheidungsfindung",
      content: (
        <p>
          Eine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne von Art. 22 DSGVO findet nicht statt. Es
          besteht keine gesetzliche oder vertragliche Pflicht, uns Daten bereitzustellen; ohne die für das Kundenkonto
          erforderlichen Angaben können wir den Dienst jedoch nicht erbringen.
        </p>
      ),
    },
    {
      id: "aenderungen",
      heading: "21. Änderungen dieser Datenschutzerklärung",
      content: (
        <p>
          Wir passen diese Datenschutzerklärung an, wenn sich unser Angebot oder die Rechtslage ändert. Es gilt die jeweils auf
          dieser Seite veröffentlichte Fassung; das Datum des Stands ist oben angegeben.
        </p>
      ),
    },
  ];
}
