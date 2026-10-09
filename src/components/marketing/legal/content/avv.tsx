import { Link } from "@/core/i18n/navigation";
import type { Operator } from "../operator";
import { Callout, Email, Val, type LegalSection } from "../ui";

/** Zusammenfassung des Auftragsverarbeitungsvertrags nach Art. 28 DSGVO. Legally binding German text. */
export function avvSections(op: Operator): LegalSection[] {
  const subprocessors: { name: string; purpose: string; location: string; basis: string }[] = [
    {
      name: op.hoster[0] ?? "Hetzner Online GmbH",
      purpose: "Hosting von Anwendung, Datenbank und Dateien; Backups",
      location: op.hosterIsDefault ? "Deutschland" : "siehe Anbieterangaben",
      basis: "Art. 28 DSGVO",
    },
    {
      name: "E-Mail-Versanddienstleister (SMTP)",
      purpose: "Versand transaktionaler E-Mails (Einladungen, Passwort-Links)",
      location: "wird bei Vertragsschluss benannt",
      basis: "Art. 28 DSGVO",
    },
    {
      name: "OpenRouter, Inc. und angebundene Modellanbieter",
      purpose: "KI-Verarbeitung ausschließlich von Speisekarteninhalten – keine Gästedaten",
      location: "USA",
      basis: "Art. 28 DSGVO; DPF bzw. Standardvertragsklauseln (Art. 45, 46 Abs. 2 lit. c DSGVO)",
    },
  ];

  return [
    {
      id: "hinweis",
      heading: "Vorbemerkung",
      content: (
        <p>
          Auf dieser Seite fassen wir den Vertrag über die Auftragsverarbeitung (AVV) nach Art. 28 DSGVO zusammen, der mit der
          Registrierung bzw. dem Abschluss eines Nutzungsvertrags elektronisch zwischen dem Kunden und dem Anbieter geschlossen wird
          und Bestandteil der <Link href="/agb">AGB</Link> ist. Die vollständige, unterzeichnungsfähige Fassung stellen wir auf
          Anfrage an <Email value={op.email} /> zur Verfügung.
        </p>
      ),
    },
    {
      id: "parteien",
      heading: "1. Parteien und Rollen",
      content: (
        <ul>
          <li>
            <strong>Verantwortlicher (Auftraggeber):</strong> der Gastronomiebetrieb, der VeroMenu nutzt (Kunde).
          </li>
          <li>
            <strong>Auftragsverarbeiter (Auftragnehmer):</strong> <Val value={op.name} name="LEGAL_NAME" /> als Betreiber von
            VeroMenu (Anbieter).
          </li>
        </ul>
      ),
    },
    {
      id: "gegenstand",
      heading: "2. Gegenstand und Dauer",
      content: (
        <p>
          Gegenstand ist die Verarbeitung personenbezogener Daten, die bei der Bereitstellung der digitalen Speisekarte, der
          Bestellfunktion, der Statistiken und der Teamverwaltung im Auftrag des Kunden anfallen. Die Laufzeit entspricht der
          Laufzeit des Nutzungsvertrags; Pflichten zur Löschung und Vertraulichkeit gelten darüber hinaus fort.
        </p>
      ),
    },
    {
      id: "art-zweck",
      heading: "3. Art und Zweck der Verarbeitung",
      content: (
        <p>
          Erheben, Speichern, Anzeigen, Übermitteln an den Kunden und Löschen von Daten zur Darstellung der Speisekarte, zur
          Entgegennahme und Weiterleitung von Bestellungen an das Team des Kunden, zur cookiefreien Reichweitenmessung und zur
          Verwaltung der Benutzerkonten des Teams. Eine Verarbeitung zu eigenen Zwecken des Anbieters findet nicht statt.
        </p>
      ),
    },
    {
      id: "datenarten",
      heading: "4. Arten personenbezogener Daten",
      content: (
        <ul>
          <li>Bestelldaten von Gästen: Tisch, bestellte Gerichte und Varianten, Freitext-Anmerkungen, gewählte Sprache, Zeitpunkt, Status;</li>
          <li>pseudonymisierte Statistikdaten: täglich wechselnder, nicht umkehrbarer Hashwert, Ereignistyp, Sprache, Zeitpunkt;</li>
          <li>Daten von Teammitgliedern: Name, E-Mail-Adresse, Rolle und Berechtigungen, Anmeldezeitpunkte, Änderungsprotokoll;</li>
          <li>Inhalte der Speisekarte, soweit sie personenbezogene Daten enthalten (z. B. Namen im Impressum des Betriebs).</li>
        </ul>
      ),
    },
    {
      id: "betroffene",
      heading: "5. Kategorien betroffener Personen",
      content: (
        <ul>
          <li>Gäste, die die Speisekarte aufrufen oder darüber bestellen;</li>
          <li>Beschäftigte und Beauftragte des Kunden mit Zugang zum Dienst.</li>
        </ul>
      ),
    },
    {
      id: "pflichten",
      heading: "6. Pflichten des Auftragsverarbeiters",
      content: (
        <ul>
          <li>Verarbeitung ausschließlich auf dokumentierte Weisung des Kunden; die Weisungen sind durch den Vertrag und die Einstellungen im Dienst festgelegt;</li>
          <li>Verpflichtung aller mit der Verarbeitung befassten Personen auf Vertraulichkeit;</li>
          <li>Umsetzung geeigneter technischer und organisatorischer Maßnahmen nach Art. 32 DSGVO (Abschnitt 7);</li>
          <li>Einsatz von Unterauftragsverarbeitern nur nach Maßgabe von Abschnitt 8;</li>
          <li>Hinweis an den Kunden, wenn eine Weisung nach Auffassung des Anbieters gegen Datenschutzrecht verstößt.</li>
        </ul>
      ),
    },
    {
      id: "tom",
      heading: "7. Technische und organisatorische Maßnahmen",
      content: (
        <ul>
          <li>Hosting in einem nach ISO/IEC 27001 zertifizierten Rechenzentrum in Deutschland;</li>
          <li>Transportverschlüsselung aller Verbindungen per TLS (HTTPS);</li>
          <li>Passwörter ausschließlich als Argon2id-Hash; hinterlegte API-Schlüssel mit AES-256-GCM verschlüsselt;</li>
          <li>rollenbasierte Zugriffskontrolle je Betrieb, Mandantentrennung auf Datenbankebene über Betriebskennungen;</li>
          <li>serverseitige Sitzungen mit Ablauf, Sperrung von Konten mit sofortiger Beendigung aller Sitzungen;</li>
          <li>regelmäßige, verschlüsselte Datensicherungen und dokumentierte Wiederherstellung;</li>
          <li>Protokollierung sicherheitsrelevanter Änderungen (Audit-Log) und Begrenzung von Anmeldeversuchen;</li>
          <li>Datensparsamkeit: keine Cookies auf der Gäste-Speisekarte, keine Speicherung von IP-Adressen in Statistiken.</li>
        </ul>
      ),
    },
    {
      id: "unterauftragsverarbeiter",
      heading: "8. Unterauftragsverarbeiter",
      content: (
        <>
          <p>Der Kunde erteilt die allgemeine Genehmigung zum Einsatz folgender Unterauftragsverarbeiter:</p>
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
          <p>
            An KI-Anbieter werden ausschließlich Speisekarteninhalte übermittelt, keine Bestell- oder Statistikdaten von Gästen.
            Über beabsichtigte Änderungen der Unterauftragsverarbeiter informiert der Anbieter den Kunden mindestens vier Wochen im
            Voraus in Textform; der Kunde kann der Änderung aus wichtigem datenschutzrechtlichem Grund widersprechen und den Vertrag
            in diesem Fall außerordentlich kündigen.
          </p>
        </>
      ),
    },
    {
      id: "unterstuetzung",
      heading: "9. Unterstützung des Verantwortlichen",
      content: (
        <p>
          Der Anbieter unterstützt den Kunden mit geeigneten Maßnahmen bei der Beantwortung von Anträgen betroffener Personen
          (Art. 12–22 DSGVO) sowie bei der Einhaltung der Pflichten nach Art. 32–36 DSGVO (Sicherheit, Meldung von Verletzungen,
          Datenschutz-Folgenabschätzung, vorherige Konsultation). Anfragen von Gästen, die beim Anbieter eingehen, leitet er
          unverzüglich an den Kunden weiter.
        </p>
      ),
    },
    {
      id: "meldepflichten",
      heading: "10. Meldung von Datenschutzverletzungen",
      content: (
        <Callout>
          <p>
            Der Anbieter meldet dem Kunden Verletzungen des Schutzes personenbezogener Daten unverzüglich, spätestens innerhalb von
            48 Stunden nach Kenntnis, mit den Informationen nach Art. 33 Abs. 3 DSGVO, soweit sie ihm vorliegen.
          </p>
        </Callout>
      ),
    },
    {
      id: "loeschung",
      heading: "11. Löschung und Rückgabe",
      content: (
        <p>
          Nach Ende des Vertrags löscht der Anbieter alle im Auftrag verarbeiteten Daten innerhalb von 30 Tagen, sofern nicht eine
          gesetzliche Pflicht zur Speicherung besteht. Vorher kann der Kunde seine Daten exportieren. Sicherungskopien werden im
          Rahmen des regulären Backup-Zyklus überschrieben.
        </p>
      ),
    },
    {
      id: "kontrollen",
      heading: "12. Nachweise und Kontrollen",
      content: (
        <p>
          Der Anbieter stellt dem Kunden alle erforderlichen Informationen zum Nachweis der Einhaltung dieser Pflichten zur
          Verfügung, insbesondere eine aktuelle Beschreibung der technischen und organisatorischen Maßnahmen sowie Zertifikate der
          Unterauftragsverarbeiter. Inspektionen vor Ort sind nach rechtzeitiger Anmeldung, zu üblichen Geschäftszeiten und ohne
          Störung des Betriebsablaufs möglich.
        </p>
      ),
    },
    {
      id: "haftung",
      heading: "13. Haftung",
      content: (
        <p>
          Für die Haftung gegenüber betroffenen Personen gilt Art. 82 DSGVO. Im Innenverhältnis gelten die Haftungsregelungen der
          AGB, soweit Art. 82 DSGVO nicht zwingend etwas anderes bestimmt.
        </p>
      ),
    },
  ];
}
