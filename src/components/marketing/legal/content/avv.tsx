import { Link } from "@/core/i18n/navigation";
import { LEGAL_VERSION_DATE } from "../legal-page";
import type { Operator } from "../operator";
import { AddressBlock, Callout, Email, Val, type LegalSection } from "../ui";

/** Version of the AVV text – bump together with LEGAL_VERSION_DATE when the content changes. */
export const AVV_VERSION = "1.0";

type Subprocessor = { name: string; purpose: string; location: string; basis: string };

/**
 * Auftragsverarbeitungsvertrag nach Art. 28 DSGVO incl. Anlage 1 (TOM) and Anlage 2 (Unterauftragsverarbeiter).
 * Legally binding German text. Keep the TOMs and sub-processors in sync with the real setup and the Datenschutzerklärung.
 */
export function avvSections(op: Operator): LegalSection[] {
  const stand = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "Europe/Berlin" }).format(LEGAL_VERSION_DATE);
  const subprocessors: Subprocessor[] = [
    {
      name: op.hoster.join(", "),
      purpose: "Bereitstellung des virtuellen Servers (Anwendung, Datenbank, hochgeladene Dateien)",
      location: "Deutschland",
      basis: "Art. 28 DSGVO",
    },
    {
      name: "Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA",
      purpose: "Content-Delivery-Network, TLS-Terminierung, Schutz vor Angriffen (Reverse-Proxy für alle Aufrufe)",
      location: "weltweites Netzwerk, Sitz USA",
      basis: "Art. 28 DSGVO; EU-US Data Privacy Framework (Art. 45 DSGVO), ergänzend Standardvertragsklauseln",
    },
    ...(op.mailProvider
      ? [
          {
            name: op.mailProvider,
            purpose: "Versand transaktionaler E-Mails an Teammitglieder (Einladungen, Bestätigungs- und Passwort-Links)",
            location: "siehe Anbieter",
            basis: "Art. 28 DSGVO",
          },
        ]
      : []),
    {
      name: "OpenRouter, Inc., USA",
      purpose: "Vermittlung von KI-Anfragen an Sprach- und Bildmodelle – ausschließlich Inhalte des Kunden, keine Gästedaten",
      location: "USA",
      basis: "Art. 28 DSGVO; Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO)",
    },
    {
      name: "Angebundene Modellanbieter: Anthropic PBC, OpenAI, L.L.C., Google LLC (alle USA); Alibaba (Qwen) als Ausweichmodell für die Spracherkennung",
      purpose: "Ausführung der KI-Modelle für Übersetzung, Allergenvorschläge, Import, Designs, Bilder, Assistent und Spracherkennung",
      location: "USA bzw. weitere Drittländer je nach Rechenzentrum",
      basis: "Art. 28 DSGVO; DPF, soweit zertifiziert, im Übrigen Standardvertragsklauseln",
    },
  ];

  return [
    {
      id: "vorbemerkung",
      heading: "Vorbemerkung",
      content: (
        <>
          <p>
            Dieser Vertrag über die Auftragsverarbeitung (AVV) nach Art. 28 DSGVO wird zwischen dem Kunden als Verantwortlichem
            und dem Anbieter als Auftragsverarbeiter geschlossen. Er gilt für alle Verarbeitungen personenbezogener Daten, die der
            Anbieter bei der Erbringung des Dienstes „VeroMenu“ nach den <Link href="/agb">AGB</Link> im Auftrag des Kunden
            durchführt, und wird mit der Registrierung bzw. dem Abschluss des Nutzungsvertrags elektronisch in Textform
            (Art. 28 Abs. 9 DSGVO) Bestandteil dieses Vertrags.
          </p>
          <p>
            Auf Wunsch stellt der Anbieter eine vom Anbieter unterzeichnete Fassung als PDF zur Verfügung; eine Anfrage an{" "}
            <Email value={op.email} /> genügt. Im Fall von Widersprüchen geht dieser AVV den AGB vor.
          </p>
        </>
      ),
    },
    {
      id: "parteien",
      heading: "§ 1 Parteien und Rollen",
      content: (
        <ul>
          <li>
            <strong>Verantwortlicher (Auftraggeber):</strong> der Gastronomiebetrieb, der VeroMenu nutzt (Kunde).
          </li>
          <li>
            <strong>Auftragsverarbeiter (Auftragnehmer):</strong> <Val value={op.name} name="LEGAL_NAME" />
            {op.address?.length ? `, ${op.address.join(", ")}` : ""}, als Betreiber von VeroMenu (Anbieter).
          </li>
        </ul>
      ),
    },
    {
      id: "gegenstand",
      heading: "§ 2 Gegenstand und Dauer",
      content: (
        <>
          <p>
            (1) Gegenstand ist die Verarbeitung personenbezogener Daten, die bei der Bereitstellung der digitalen Speisekarte, der
            Bestellfunktion, der Speisekarten-Statistik und der Teamverwaltung im Auftrag des Kunden anfallen.
          </p>
          <p>
            (2) Die Laufzeit entspricht der Laufzeit des Nutzungsvertrags. Die Pflichten zur Löschung (§ 9) und zur Vertraulichkeit
            gelten darüber hinaus fort.
          </p>
        </>
      ),
    },
    {
      id: "art-zweck",
      heading: "§ 3 Art und Zweck der Verarbeitung, Datenarten, Betroffene",
      content: (
        <>
          <p>
            (1) <strong>Art und Zweck:</strong> Erheben, Speichern, Anzeigen, Übermitteln an den Kunden und Löschen von Daten zur
            Entgegennahme und Weiterleitung von Bestellungen an das Team des Kunden, zur cookiefreien Statistik über die Nutzung der
            Speisekarte und zur Verwaltung der Benutzerkonten des Teams. Eine Verarbeitung zu eigenen Zwecken des Anbieters findet
            nicht statt; insbesondere nutzt der Anbieter die Daten nicht zum Training von KI-Modellen.
          </p>
          <p>
            (2) <strong>Arten personenbezogener Daten:</strong>
          </p>
          <ul>
            <li>Bestelldaten von Gästen: Tisch, bestellte Gerichte und Varianten, Freitext-Anmerkungen, gewählte Sprache, Zeitpunkt, Status;</li>
            <li>
              pseudonyme Statistikdaten: gekürzter Hashwert aus IP-Adresse, User-Agent, Restaurantkennung und täglich wechselndem
              Schlüssel (IP-Adresse und User-Agent selbst werden nicht gespeichert), Ereignistyp, Sprache, Tisch, Zeitpunkt;
            </li>
            <li>Daten von Teammitgliedern: Name, E-Mail-Adresse, Rolle und Berechtigungen, Sitzungen (Ablauf, User-Agent), Anmeldezeitpunkte, Änderungsprotokoll;</li>
            <li>
              Inhalte des Kunden, soweit sie personenbezogene Daten enthalten (z. B. Namen im Impressum des Betriebs, Fotos,
              Spracheingaben an den KI-Assistenten).
            </li>
          </ul>
          <p>
            (3) <strong>Betroffene Personen:</strong> Gäste, die die Speisekarte aufrufen oder darüber bestellen; Beschäftigte und
            Beauftragte des Kunden mit Zugang zum Dienst; im Impressum des Betriebs genannte Personen.
          </p>
        </>
      ),
    },
    {
      id: "weisungen",
      heading: "§ 4 Weisungen",
      content: (
        <>
          <p>
            (1) Der Anbieter verarbeitet die Daten nur auf dokumentierte Weisung des Kunden, auch in Bezug auf Übermittlungen in
            Drittländer, es sei denn, er ist nach Unionsrecht oder deutschem Recht zur Verarbeitung verpflichtet; in diesem Fall
            teilt er dem Kunden die rechtlichen Anforderungen vor der Verarbeitung mit, sofern das Recht dies nicht verbietet.
          </p>
          <p>
            (2) Die Weisungen sind durch diesen Vertrag, die AGB und die vom Kunden im Dienst vorgenommenen Einstellungen (z. B.
            Aktivierung der Bestellfunktion, Teamrollen, Löschungen) festgelegt. Weitere Weisungen erteilt der Kunde in Textform an{" "}
            <Email value={op.email} />.
          </p>
          <p>
            (3) Ist der Anbieter der Ansicht, dass eine Weisung gegen Datenschutzrecht verstößt, weist er den Kunden unverzüglich
            darauf hin und darf die Ausführung bis zur Bestätigung oder Änderung der Weisung aussetzen.
          </p>
        </>
      ),
    },
    {
      id: "pflichten",
      heading: "§ 5 Pflichten des Auftragsverarbeiters",
      content: (
        <ul>
          <li>
            Alle mit der Verarbeitung befassten Personen sind zur Vertraulichkeit verpflichtet oder unterliegen einer angemessenen
            gesetzlichen Verschwiegenheitspflicht. Derzeit hat ausschließlich der Inhaber des Anbieters Zugriff auf die Systeme.
          </li>
          <li>
            Der Anbieter trifft die technischen und organisatorischen Maßnahmen nach Art. 32 DSGVO gemäß <a href="#anlage-1">Anlage 1</a>{" "}
            und passt sie dem Stand der Technik an, ohne das Schutzniveau zu unterschreiten.
          </li>
          <li>Unterauftragsverarbeiter setzt der Anbieter nur nach § 6 ein.</li>
          <li>
            Ein Datenschutzbeauftragter ist beim Anbieter nicht benannt, da hierfür keine gesetzliche Pflicht besteht; Ansprechpartner
            für Datenschutzfragen ist der Inhaber (<Email value={op.email} />).
          </li>
        </ul>
      ),
    },
    {
      id: "unterauftragsverarbeiter",
      heading: "§ 6 Unterauftragsverarbeiter",
      content: (
        <>
          <p>
            (1) Der Kunde erteilt die allgemeine Genehmigung zum Einsatz von Unterauftragsverarbeitern. Die bei Vertragsschluss
            eingesetzten Unterauftragsverarbeiter sind in <a href="#anlage-2">Anlage 2</a> aufgeführt und gelten als genehmigt.
          </p>
          <p>
            (2) Der Anbieter verpflichtet jeden Unterauftragsverarbeiter vertraglich auf Datenschutzpflichten, die denen dieses
            Vertrags im Wesentlichen entsprechen (Art. 28 Abs. 4 DSGVO). Übermittlungen in Drittländer erfolgen nur unter den
            Voraussetzungen der Art. 44 ff. DSGVO.
          </p>
          <p>
            (3) Über beabsichtigte Änderungen (Hinzuziehung oder Ersetzung) informiert der Anbieter den Kunden mindestens vier
            Wochen im Voraus in Textform, etwa per E-Mail oder Hinweis im Kundenbereich. Der Kunde kann der Änderung innerhalb
            dieser Frist aus wichtigem datenschutzrechtlichem Grund widersprechen. Können sich die Parteien nicht einigen, kann der
            Kunde den Vertrag zum Zeitpunkt der Änderung außerordentlich kündigen.
          </p>
          <p>
            (4) Der Wechsel des KI-Modells innerhalb der in Anlage 2 genannten Modellanbieter ist keine Änderung im Sinne von
            Abs. 3. An KI-Anbieter werden ausschließlich Inhalte des Kunden übermittelt, keine Bestell- oder Statistikdaten von
            Gästen.
          </p>
        </>
      ),
    },
    {
      id: "unterstuetzung",
      heading: "§ 7 Unterstützung des Verantwortlichen",
      content: (
        <>
          <p>
            (1) Der Anbieter unterstützt den Kunden mit geeigneten technischen und organisatorischen Maßnahmen bei der Beantwortung
            von Anträgen betroffener Personen (Art. 12–22 DSGVO). Anfragen von Gästen oder Teammitgliedern, die beim Anbieter
            eingehen, leitet er unverzüglich an den Kunden weiter und beantwortet sie nicht selbst, soweit der Kunde nichts anderes
            anweist.
          </p>
          <p>
            (2) Der Anbieter unterstützt den Kunden bei der Einhaltung der Pflichten aus Art. 32–36 DSGVO (Sicherheit, Meldung von
            Verletzungen, Datenschutz-Folgenabschätzung, vorherige Konsultation) unter Berücksichtigung der Art der Verarbeitung und
            der ihm zur Verfügung stehenden Informationen.
          </p>
        </>
      ),
    },
    {
      id: "meldepflichten",
      heading: "§ 8 Meldung von Datenschutzverletzungen",
      content: (
        <Callout>
          <p>
            Der Anbieter meldet dem Kunden Verletzungen des Schutzes personenbezogener Daten unverzüglich, spätestens innerhalb von
            48 Stunden nach Kenntnis, per E-Mail an die im Kundenkonto hinterlegte Adresse des Inhabers. Die Meldung enthält die
            Informationen nach Art. 33 Abs. 3 DSGVO, soweit sie vorliegen; fehlende Informationen werden unverzüglich nachgereicht.
            Der Anbieter ergreift unverzüglich Maßnahmen zur Eindämmung und dokumentiert den Vorfall.
          </p>
        </Callout>
      ),
    },
    {
      id: "loeschung",
      heading: "§ 9 Löschung und Rückgabe",
      content: (
        <>
          <p>
            (1) Während der Laufzeit kann der Kunde Daten im Dienst jederzeit selbst löschen; Löschungen wirken sofort in der
            laufenden Datenbank. Statistikereignisse werden nach 24 Monaten automatisch gelöscht.
          </p>
          <p>
            (2) Nach Ende des Vertrags löscht der Anbieter alle im Auftrag verarbeiteten Daten innerhalb von 30 Tagen, sofern nicht
            eine gesetzliche Pflicht zur Speicherung besteht. Vorher kann der Kunde seine Daten exportieren oder deren Herausgabe in
            einem gängigen maschinenlesbaren Format verlangen. Etwa vorhandene Sicherungskopien werden spätestens im Rahmen ihres
            regulären Überschreibungszyklus gelöscht. Auf Verlangen bestätigt der Anbieter die Löschung in Textform.
          </p>
        </>
      ),
    },
    {
      id: "kontrollen",
      heading: "§ 10 Nachweise und Kontrollen",
      content: (
        <p>
          Der Anbieter stellt dem Kunden auf Anfrage alle erforderlichen Informationen zum Nachweis der Einhaltung der Pflichten
          aus Art. 28 DSGVO zur Verfügung, insbesondere diesen Vertrag mit seinen Anlagen und Nachweise der Unterauftragsverarbeiter
          (z. B. Zertifikate, Vertragsbedingungen). Der Kunde oder ein von ihm beauftragter, zur Verschwiegenheit verpflichteter
          Prüfer, der kein Wettbewerber des Anbieters ist, kann Überprüfungen einschließlich Inspektionen nach Anmeldung mit
          angemessener Frist (in der Regel 14 Tage), zu üblichen Geschäftszeiten und ohne vermeidbare Störung des Betriebs
          durchführen. Da die Systeme in Rechenzentren von Unterauftragsverarbeitern betrieben werden, erfolgen Kontrollen dort
          in erster Linie über deren Zertifikate und Prüfberichte. Jede Partei trägt ihre eigenen Kosten.
        </p>
      ),
    },
    {
      id: "pflichten-kunde",
      heading: "§ 11 Pflichten des Verantwortlichen",
      content: (
        <p>
          Der Kunde ist für die Rechtmäßigkeit der Verarbeitung verantwortlich, insbesondere für die Information seiner Gäste
          (Art. 13 DSGVO) über die Bestellfunktion und die Statistik. Er informiert den Anbieter unverzüglich, wenn er Fehler oder
          Unregelmäßigkeiten bei der Verarbeitung feststellt.
        </p>
      ),
    },
    {
      id: "schluss",
      heading: "§ 12 Haftung und Schlussbestimmungen",
      content: (
        <>
          <p>
            (1) Für die Haftung gegenüber betroffenen Personen gilt Art. 82 DSGVO. Im Innenverhältnis gelten die
            Haftungsregelungen der AGB, soweit Art. 82 DSGVO nicht zwingend etwas anderes bestimmt.
          </p>
          <p>
            (2) Änderungen dieses Vertrags bedürfen der Textform. Sollten einzelne Bestimmungen unwirksam sein, bleibt die
            Wirksamkeit der übrigen unberührt. Es gilt deutsches Recht; Gerichtsstand ist Hamburg, soweit gesetzlich zulässig.
          </p>
          <p>
            (3) Stand: {stand}, Version {AVV_VERSION}. Die jeweils gültige Fassung ist unter dieser Adresse abrufbar; frühere
            Fassungen stellt der Anbieter auf Anfrage zur Verfügung.
          </p>
        </>
      ),
    },
    {
      id: "anlage-1",
      heading: "Anlage 1 – Technische und organisatorische Maßnahmen (Art. 32 DSGVO)",
      content: (
        <>
          <h3>Vertraulichkeit</h3>
          <ul>
            <li>
              <strong>Zutrittskontrolle:</strong> Die Server stehen ausschließlich in Rechenzentren des Hosting-Anbieters in
              Deutschland mit dessen physischen Sicherungsmaßnahmen (Zugangskontrolle, Videoüberwachung, Alarmanlagen); der Anbieter
              selbst betreibt keine eigenen Serverräume.
            </li>
            <li>
              <strong>Zugangskontrolle:</strong> Administrativer Zugang zum Server ausschließlich für den Inhaber über verschlüsseltes
              SSH; die Datenbank ist nicht aus dem Internet erreichbar (nur innerhalb des Servers), die Anwendung lauscht nur lokal
              hinter einem Reverse-Proxy. Benutzerkonten im Dienst sind durch Passwort geschützt (Speicherung nur als
              Argon2id-Hash), Anmeldeversuche werden begrenzt.
            </li>
            <li>
              <strong>Zugriffskontrolle:</strong> Rollen- und Berechtigungskonzept je Betrieb (Inhaber, Manager, Service, Küche,
              Redakteur, eigene Rollen); serverseitige Sitzungen mit Ablauf, Einsicht und Beendigung aktiver Sitzungen durch den
              Nutzer; hinterlegte API-Schlüssel mit AES-256-GCM verschlüsselt.
            </li>
            <li>
              <strong>Trennungskontrolle:</strong> Mandantentrennung über Betriebskennungen in jeder Abfrage; Speisekarten-Designs
              laufen in einer abgeschotteten Sandbox ohne Zugriff auf Plattformdaten.
            </li>
            <li>
              <strong>Pseudonymisierung:</strong> Statistikdaten nur als pseudonymer Hashwert mit täglich wechselndem Schlüssel;
              keine Speicherung von IP-Adressen in der Anwendung.
            </li>
          </ul>
          <h3>Integrität</h3>
          <ul>
            <li>
              <strong>Weitergabekontrolle:</strong> Alle Verbindungen sind per TLS (HTTPS) verschlüsselt – zwischen Browser und
              Cloudflare sowie zwischen Cloudflare und dem Server. Strenge Sicherheits-Header (Content-Security-Policy,
              HSTS, X-Frame-Options).
            </li>
            <li>
              <strong>Eingabekontrolle:</strong> Protokollierung wesentlicher Änderungen mit Nutzer und Zeitpunkt (Audit-Log);
              Änderungen durch den KI-Assistenten nur nach Vorschau und ausdrücklicher Bestätigung, mit Rückgängig-Funktion.
            </li>
          </ul>
          <h3>Verfügbarkeit und Belastbarkeit</h3>
          <ul>
            <li>Schutz vor Überlastungs- und DDoS-Angriffen durch Cloudflare; Begrenzung von Anfragen an öffentliche Schnittstellen.</li>
            <li>Automatische Sicherheitsupdates des Betriebssystems; Container mit Health-Checks und automatischem Neustart.</li>
            <li>Dokumentiertes Verfahren zur Sicherung und Wiederherstellung von Datenbank und hochgeladenen Dateien.</li>
          </ul>
          <h3>Verfahren zur regelmäßigen Überprüfung</h3>
          <ul>
            <li>Datenschutzfreundliche Voreinstellungen: keine Tracking-Cookies, keine Gästekonten, Bestellungen ohne Namensangabe.</li>
            <li>Überprüfung dieser Maßnahmen bei wesentlichen Änderungen am Dienst, mindestens einmal jährlich.</li>
            <li>Auswahl von Unterauftragsverarbeitern nach ihren Sicherheitsnachweisen (z. B. ISO/IEC 27001, SOC 2).</li>
          </ul>
        </>
      ),
    },
    {
      id: "anlage-2",
      heading: "Anlage 2 – Unterauftragsverarbeiter",
      content: (
        <>
          <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Unternehmen</th>
                  <th className="px-4 py-2.5 font-semibold">Leistung</th>
                  <th className="px-4 py-2.5 font-semibold">Ort</th>
                  <th className="px-4 py-2.5 font-semibold">Grundlage</th>
                </tr>
              </thead>
              <tbody>
                {subprocessors.map((s) => (
                  <tr key={s.name} className="border-t border-stone-100 align-top">
                    <td className="px-4 py-3 font-medium text-stone-900">{s.name}</td>
                    <td className="px-4 py-3">{s.purpose}</td>
                    <td className="px-4 py-3">{s.location}</td>
                    <td className="px-4 py-3">{s.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Kontakt für Fragen zu diesem Vertrag:</p>
          <AddressBlock lines={[op.name ?? "", ...(op.address ?? []), op.email ?? ""]} />
        </>
      ),
    },
  ];
}
