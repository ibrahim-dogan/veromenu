import type { Operator } from "../operator";
import { Link } from "@/core/i18n/navigation";
import { AddressBlock, Callout, Email, InfoRows, Val, type LegalSection } from "../ui";

const CLOUDFLARE = ["Cloudflare, Inc.", "101 Townsend St.", "San Francisco, CA 94107", "USA"];

/**
 * Datenschutzerklärung (DSGVO / BDSG / TDDDG). Legally binding German text.
 * Keep in sync with what the app really does: cookies/storage (src/core/auth/session.ts, src/core/i18n/routing.ts,
 * src/modules/guest/components/runtime.tsx + cart.tsx, src/modules/ordering/components/use-order-feed.ts),
 * analytics (src/modules/analytics/track.ts), AI providers (Admin → KI-Anbieter) and the CSP in next.config.ts.
 */
export function datenschutzSections(op: Operator): LegalSection[] {
  // Numbered automatically; cross-references in the text ("Abschnitt 4") must match this order.
  const sections: { id: string; title: string; content: React.ReactNode }[] = [
    {
      id: "verantwortlicher",
      title: "Verantwortlicher",
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
            Ein Datenschutzbeauftragter ist nicht benannt, da hierfür keine gesetzliche Pflicht besteht (Art. 37 DSGVO, § 38 BDSG).
            Bei Fragen zum Datenschutz wenden Sie sich bitte direkt an die oben genannten Kontaktdaten.
          </p>
        </>
      ),
    },
    {
      id: "ueberblick",
      title: "Überblick",
      content: (
        <>
          <p>
            VeroMenu ist eine Software für digitale QR-Speisekarten, die sich ausschließlich an Gastronomiebetriebe (Unternehmer)
            richtet. Wir unterscheiden zwei Rollen:
          </p>
          <ul>
            <li>
              <strong>Als Verantwortliche</strong> verarbeiten wir Daten von Besucherinnen und Besuchern dieser Website und der
              Speisekarten (technische Bereitstellung, Sicherheit, Reichweitenmessung) sowie von unseren Kunden – den
              Gastronomiebetrieben und ihren Teammitgliedern –, die ein Konto bei uns führen.
            </li>
            <li>
              <strong>Als Auftragsverarbeiter</strong> verarbeiten wir Daten der Gäste eines Restaurants (insbesondere Bestellungen
              über die Speisekarte) im Auftrag des jeweiligen Betriebs. Verantwortlich ist insoweit der Betrieb; Grundlage ist ein
              Auftragsverarbeitungsvertrag nach Art. 28 DSGVO, den wir allen Kunden anbieten (siehe{" "}
              <Link href="/avv">AV-Vertrag</Link>).
            </li>
          </ul>
          <p>
            Wir verwenden keine Tracking- oder Marketing-Cookies, keine Werbedienste und keine Social-Media-Plugins. Die
            Reichweitenmessung erfolgt cookiefrei (Abschnitte 6 und 12).
          </p>
        </>
      ),
    },
    {
      id: "hosting",
      title: "Hosting",
      content: (
        <>
          <p>
            Anwendung, Datenbank und hochgeladene Dateien liegen auf einem von uns betriebenen virtuellen Server in einem
            Rechenzentrum in Deutschland. Hosting-Anbieter ist:
          </p>
          <AddressBlock lines={op.hoster} />
          <p>
            Der Hosting-Anbieter stellt die Server-Infrastruktur bereit und verarbeitet die darauf gespeicherten Daten ausschließlich
            in unserem Auftrag (Art. 28 DSGVO). Rechtsgrundlage ist unser berechtigtes Interesse an einer sicheren und zuverlässigen
            Bereitstellung unseres Angebots (Art. 6 Abs. 1 lit. f DSGVO) bzw. die Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).
          </p>
        </>
      ),
    },
    {
      id: "cloudflare",
      title: "Content-Delivery-Network und Schutz vor Angriffen (Cloudflare)",
      content: (
        <>
          <p>
            Alle Aufrufe von veromenu.de – auch der Speisekarten unter <code>/m/…</code> – werden über das Netzwerk von Cloudflare
            geleitet. Anbieter ist:
          </p>
          <AddressBlock lines={CLOUDFLARE} />
          <p>
            Cloudflare arbeitet als sogenannter Reverse-Proxy: Die verschlüsselte Verbindung Ihres Browsers endet bei Cloudflare und
            wird von dort verschlüsselt an unseren Server weitergeleitet. Dabei verarbeitet Cloudflare insbesondere Ihre IP-Adresse,
            Datum und Uhrzeit, die aufgerufene Adresse, Browsertyp und Betriebssystem sowie die übertragenen Inhalte. Das ist
            erforderlich, um die Website schnell auszuliefern, Angriffe (z. B. DDoS) abzuwehren und missbräuchliche Zugriffe zu
            erkennen.
          </p>
          <p>
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt in der sicheren und zuverlässigen
            Bereitstellung des Angebots. Mit Cloudflare besteht ein Vertrag zur Auftragsverarbeitung. Cloudflare ist unter dem EU-US
            Data Privacy Framework zertifiziert; die Übermittlung in die USA erfolgt auf Grundlage des Angemessenheitsbeschlusses der
            EU-Kommission (Art. 45 DSGVO). Zu den von Cloudflare gegebenenfalls gesetzten Sicherheits-Cookies siehe Abschnitt 7.
          </p>
        </>
      ),
    },
    {
      id: "server-logs",
      title: "Server-Logfiles",
      content: (
        <>
          <p>Bei jedem Aufruf speichert unser Webserver technisch notwendige Informationen in Logfiles:</p>
          <ul>
            <li>IP-Adresse des anfragenden Geräts,</li>
            <li>Datum und Uhrzeit des Zugriffs,</li>
            <li>aufgerufene Adresse (URL) und HTTP-Statuscode,</li>
            <li>übertragene Datenmenge, Referrer-URL sowie Browsertyp und -version (User-Agent).</li>
          </ul>
          <p>
            Die Verarbeitung dient der Auslieferung der Website, der Systemsicherheit (z. B. Abwehr von Angriffen, Begrenzung zu
            vieler Anfragen) und der Fehleranalyse. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Die Logfiles werden nach
            spätestens 14 Tagen automatisch gelöscht, sofern sie nicht im Einzelfall zur Aufklärung eines Sicherheitsvorfalls
            länger benötigt werden.
          </p>
        </>
      ),
    },
    {
      id: "web-analytics",
      title: "Cookiefreie Reichweitenmessung (Cloudflare Web Analytics)",
      content: (
        <>
          <p>
            Um zu verstehen, wie unsere Seiten genutzt werden und wie schnell sie laden, verwenden wir Cloudflare Web Analytics
            (Anbieter: Cloudflare, Inc., siehe Abschnitt 4). Dafür lädt Ihr Browser ein kleines Skript von{" "}
            <code>static.cloudflareinsights.com</code>, das beim Seitenaufruf die aufgerufene Adresse, die Referrer-URL, Browser,
            Betriebssystem, Gerätetyp und Ladezeiten der Seite an Cloudflare (<code>cloudflareinsights.com</code>) übermittelt.
            Dabei wird zwangsläufig Ihre IP-Adresse verarbeitet.
          </p>
          <p>
            Cloudflare Web Analytics <strong>setzt keine Cookies, nutzt keinen lokalen Speicher und bildet kein
            Nutzerprofil</strong>; es werden keine Informationen auf Ihrem Endgerät gespeichert. Wir erhalten ausschließlich
            zusammengefasste Statistiken (z. B. Seitenaufrufe, Herkunftsländer, Ladezeiten) und keine Daten, mit denen wir einzelne
            Personen identifizieren könnten.
          </p>
          <p>
            Rechtsgrundlage ist unser berechtigtes Interesse an einer datensparsamen Analyse und Verbesserung unseres Angebots
            (Art. 6 Abs. 1 lit. f DSGVO). Zur Übermittlung in die USA siehe Abschnitt 4. Sie können der Verarbeitung jederzeit
            widersprechen (Abschnitt 19) oder sie verhindern, indem Sie Skripte von <code>cloudflareinsights.com</code> in Ihrem
            Browser blockieren; die Website funktioniert dann uneingeschränkt.
          </p>
        </>
      ),
    },
    {
      id: "cookies",
      title: "Cookies und lokale Speicherung",
      content: (
        <>
          <p>
            Wir speichern nur dann Informationen auf Ihrem Gerät, wenn dies für eine von Ihnen ausdrücklich gewünschte Funktion
            unbedingt erforderlich ist:
          </p>
          <ul>
            <li>
              <strong>vm_session</strong> (Cookie) – nur nach dem Login: hält Sie angemeldet. Enthält lediglich eine zufällige
              Kennung, die Sitzung selbst wird serverseitig verwaltet (httpOnly, nur über HTTPS). Laufzeit bis zu 30 Tage oder bis
              zur Abmeldung.
            </li>
            <li>
              <strong>vm_locale</strong> (Cookie) – merkt sich die Sprache der Benutzeroberfläche (Deutsch, Englisch oder
              Türkisch), damit Seiten in der gewählten Sprache ausgeliefert werden. Laufzeit 12 Monate.
            </li>
            <li>
              <strong>vm_cart_…</strong> und <strong>vm_last_order_…</strong> (lokaler Speicher Ihres Browsers) – nur auf
              Speisekarten mit Bestellfunktion: speichern den Warenkorb bzw. die Nummer Ihrer letzten Bestellung, damit Sie den
              Bestellstatus wieder aufrufen können. Die Daten verlassen Ihr Gerät nur, wenn Sie eine Bestellung absenden.
            </li>
            <li>
              <strong>vm_order_sound</strong> (lokaler Speicher) – nur im Kundenbereich: merkt sich, ob der Signalton für neue
              Bestellungen eingeschaltet ist.
            </li>
            <li>
              <strong>__cf_bm</strong> bzw. <strong>cf_clearance</strong> (Cookies von Cloudflare) – können im Einzelfall gesetzt
              werden, um automatisierte Zugriffe (Bots) zu erkennen bzw. eine bestandene Sicherheitsprüfung zu speichern. Laufzeit
              30 Minuten bzw. bis zu einige Tage.
            </li>
          </ul>
          <p>
            Diese Speicherungen sind technisch unbedingt erforderlich und daher nach § 25 Abs. 2 Nr. 2 TDDDG ohne Einwilligung
            zulässig. Die anschließende Verarbeitung beruht auf Art. 6 Abs. 1 lit. b DSGVO (Nutzung des Kundenkontos bzw. der
            Bestellfunktion) bzw. Art. 6 Abs. 1 lit. f DSGVO (Sprache, Sicherheit). Tracking-, Analyse- oder Marketing-Cookies setzen
            wir nicht ein – deshalb gibt es auf VeroMenu kein Cookie-Banner. Sie können Cookies und lokalen Speicher jederzeit in
            Ihrem Browser löschen; Login und Warenkorb funktionieren dann nicht bzw. beginnen neu.
          </p>
        </>
      ),
    },
    {
      id: "schriften",
      title: "Schriftarten und externe Inhalte",
      content: (
        <p>
          Alle Schriftarten, Skripte und Grafiken werden von unserem eigenen Server ausgeliefert – wir nutzen insbesondere keine
          Google Fonts. Einzige Ausnahme ist das Skript von Cloudflare Web Analytics (Abschnitt 6). Links auf Websites Dritter, etwa
          die Website eines Restaurants, übertragen erst dann Daten an den jeweiligen Anbieter, wenn Sie den Link anklicken.
        </p>
      ),
    },
    {
      id: "kundenkonto",
      title: "Registrierung und Kundenkonto",
      content: (
        <>
          <p>
            Für die Nutzung von VeroMenu ist ein Kundenkonto erforderlich. Dabei verarbeiten wir Name, E-Mail-Adresse, ein
            Passwort (ausschließlich als Argon2id-Hash gespeichert), die bevorzugte Sprache, den Namen des Betriebs sowie die von
            Ihnen eingegebenen Inhalte (Speisekarte, Bilder, Dokumente, Betriebs- und Impressumsangaben, Tische, Teamrollen). Für
            jede Anmeldung speichern wir eine Sitzung mit Ablaufdatum und Browserkennung (User-Agent), damit Sie Ihre aktiven
            Sitzungen einsehen und beenden können. Zur Sicherheit protokollieren wir wesentliche Änderungen (Audit-Log) und den
            Zeitpunkt der letzten Anmeldung.
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
      title: "E-Mail-Versand",
      content: (
        <p>
          Wir versenden ausschließlich transaktionale E-Mails, die für die Nutzung erforderlich sind – etwa zur Bestätigung der
          E-Mail-Adresse, zum Zurücksetzen des Passworts oder für Team-Einladungen. Setzen wir dafür einen E-Mail-Dienstleister
          ein, ist er als Auftragsverarbeiter für uns tätig. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Newsletter oder
          Werbe-E-Mails versenden wir nicht.
        </p>
      ),
    },
    {
      id: "kontaktaufnahme",
      title: "Kontaktaufnahme",
      content: (
        <>
          <p>
            Wenn Sie uns per E-Mail oder Telefon kontaktieren, verarbeiten wir Ihre Angaben (Name, Kontaktdaten, Inhalt der Anfrage)
            zur Bearbeitung Ihres Anliegens. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit die Anfrage mit einem Vertrag
            zusammenhängt, im Übrigen unser berechtigtes Interesse an der Beantwortung (Art. 6 Abs. 1 lit. f DSGVO).
          </p>
          <p>
            E-Mails an unsere Kontaktadresse werden über Cloudflare Email Routing (Cloudflare, Inc., siehe Abschnitt 4) an ein
            Postfach bei Google Gmail weitergeleitet. Anbieter ist die Google Ireland Limited, Gordon House, Barrow Street, Dublin 4,
            Irland. Google kann Daten auch in den USA verarbeiten; Google ist unter dem EU-US Data Privacy Framework zertifiziert.
            Nachrichten löschen wir, sobald sie nicht mehr benötigt werden, soweit keine gesetzlichen Aufbewahrungspflichten
            bestehen (etwa für Geschäftsbriefe nach § 147 AO und § 257 HGB).
          </p>
        </>
      ),
    },
    {
      id: "gaeste-statistik",
      title: "Speisekarten-Statistik für Restaurants (cookiefrei)",
      content: (
        <>
          <p>
            Damit Betriebe sehen, wie ihre Speisekarte genutzt wird (z. B. Aufrufe, QR-Scans je Tisch, beliebte Gerichte, gewählte
            Sprachen), erfassen wir beim Aufruf einer Speisekarte Nutzungsereignisse. Dafür werden <strong>keine Cookies gesetzt und
            keine Daten auf dem Gerät gespeichert</strong>.
          </p>
          <p>
            Um Mehrfachaufrufe desselben Geräts an einem Tag zusammenzufassen, bilden wir aus IP-Adresse, User-Agent, der Kennung des
            Restaurants und einem geheimen, täglich wechselnden Schlüssel einen gekürzten kryptografischen Hashwert (SHA-256).
            Gespeichert wird nur dieser pseudonyme Hashwert – <strong>IP-Adresse und User-Agent selbst werden nicht
            gespeichert</strong>. Weil der Schlüssel täglich wechselt, lassen sich Aufrufe nicht tagesübergreifend verknüpfen; eine
            Profilbildung findet nicht statt. Bekannte Bots und Vorab-Ladevorgänge werden nicht erfasst.
          </p>
          <p>
            Rechtsgrundlage ist unser berechtigtes Interesse und das der Betriebe an einer datensparsamen Reichweitenmessung
            (Art. 6 Abs. 1 lit. f DSGVO). Die Ereignisse werden nach 24 Monaten automatisch gelöscht, bei Löschung eines Restaurants
            sofort.
          </p>
        </>
      ),
    },
    {
      id: "bestellungen",
      title: "Bestellungen über die Speisekarte",
      content: (
        <p>
          Bietet ein Betrieb Bestellungen über die Speisekarte an, verarbeiten wir die Bestelldaten (Tisch, bestellte Gerichte,
          optionale Anmerkungen, gewählte Sprache, Zeitpunkt) ausschließlich im Auftrag dieses Betriebs. Verantwortlicher für diese
          Verarbeitung ist der jeweilige Betrieb, der Ihnen auch für Auskünfte zur Verfügung steht; seine Kontaktdaten finden Sie im
          Impressum der Speisekarte. Ein Gastkonto oder die Angabe von Name und Kontaktdaten ist für Bestellungen nicht
          erforderlich. Bitte geben Sie in Freitextfeldern keine sensiblen Daten an.
        </p>
      ),
    },
    {
      id: "ki",
      title: "KI-Funktionen",
      content: (
        <>
          <p>
            Für Übersetzungen, Allergen- und Zusatzstoffvorschläge, den Import von Speisekarten aus Fotos oder PDFs, die
            Gestaltung von Speisekarten-Designs, die Bildgenerierung und den KI-Assistenten übermitteln wir die dafür nötigen{" "}
            <strong>Inhalte des Betriebs</strong> – etwa Namen, Beschreibungen und Zutaten von Gerichten, hochgeladene Fotos, Logos
            oder PDFs von Speisekarten sowie Ihre Anweisungen an den Assistenten – an folgenden Dienst:
          </p>
          <AddressBlock lines={["OpenRouter, Inc.", "USA"]} />
          <p>
            OpenRouter leitet jede Anfrage an das für die jeweilige Aufgabe eingestellte Sprach- oder Bildmodell weiter. Derzeit
            sind das Modelle von Anthropic PBC, OpenAI, L.L.C. und Google LLC (alle USA) sowie als Ausweichmodell für die
            Spracherkennung ein Modell von Alibaba (Qwen), das je nach Verfügbarkeit bei Anbietern in den USA oder anderen
            Drittländern betrieben wird. Die Modellauswahl kann sich ändern; die jeweils eingesetzten Anbieter nennen wir Ihnen auf
            Anfrage.
          </p>
          <p>
            <strong>Daten von Gästen (z. B. Bestellungen oder Statistikdaten) werden nicht an KI-Anbieter übermittelt.</strong>{" "}
            Betriebe werden gebeten, in Speisekarteninhalten und Anweisungen keine personenbezogenen Daten Dritter anzugeben.
            Rechtsgrundlage ist die Vertragserfüllung gegenüber dem Betrieb (Art. 6 Abs. 1 lit. b DSGVO). Zu Übermittlungen in
            Drittländer siehe Abschnitt 16. Die Ergebnisse der KI sind Vorschläge; sie werden erst nach Prüfung durch den Betrieb
            veröffentlicht.
          </p>
        </>
      ),
    },
    {
      id: "spracheingabe",
      title: "Spracheingabe des KI-Assistenten",
      content: (
        <p>
          Nutzen Sie die Spracheingabe, wird Ihre Stimme erst nach Ihrem Klick über das Mikrofon Ihres Geräts aufgenommen, an
          unseren Server übertragen und zur Umwandlung in Text an den in Abschnitt 14 genannten KI-Dienst übermittelt. Die
          Aufnahme wird von uns nicht gespeichert; gespeichert wird nur der erkannte Text als Teil des Änderungsvorschlags.
          Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
        </p>
      ),
    },
    {
      id: "drittland",
      title: "Übermittlung in Drittländer",
      content: (
        <p>
          Soweit Daten in die USA übermittelt werden, erfolgt dies auf Grundlage des Angemessenheitsbeschlusses der EU-Kommission
          zum EU-US Data Privacy Framework (Art. 45 DSGVO), sofern der Empfänger danach zertifiziert ist, und im Übrigen – ebenso
          wie bei Übermittlungen in andere Drittländer – auf Grundlage der EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c
          DSGVO). Eine Kopie der Garantien können Sie über die oben genannten Kontaktdaten anfordern.
        </p>
      ),
    },
    {
      id: "zahlung",
      title: "Zahlungsabwicklung",
      content: (
        <p>
          Derzeit erfolgt die Abrechnung kostenpflichtiger Tarife per Rechnung; ein Zahlungsdienstleister ist nicht eingebunden.
          Wir verarbeiten dafür Rechnungs- und Vertragsdaten (Art. 6 Abs. 1 lit. b und lit. c DSGVO). Sollten wir künftig einen
          Zahlungsdienstleister einsetzen, werden wir ihn in dieser Erklärung benennen.
        </p>
      ),
    },
    {
      id: "speicherdauer",
      title: "Speicherdauer",
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
      title: "Ihre Rechte",
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
      title: "Beschwerderecht bei der Aufsichtsbehörde",
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
      title: "Datensicherheit",
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
      title: "Keine automatisierte Entscheidungsfindung",
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
      title: "Änderungen dieser Datenschutzerklärung",
      content: (
        <p>
          Wir passen diese Datenschutzerklärung an, wenn sich unser Angebot oder die Rechtslage ändert. Es gilt die jeweils auf
          dieser Seite veröffentlichte Fassung; das Datum des Stands ist oben angegeben.
        </p>
      ),
    },
  ];

  return sections.map((s, i) => ({ id: s.id, heading: `${i + 1}. ${s.title}`, content: s.content }));
}
