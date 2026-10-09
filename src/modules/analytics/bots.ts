/** Crawlers, link previews, monitors and CLI clients are not guests. */
const BOT_UA =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp\/|bingpreview|headless|lighthouse|pagespeed|pingdom|uptime|monitor|curl\/|wget|python-requests|python-urllib|httpclient|okhttp|go-http-client|java\/|axios|node-fetch|undici|postman|insomnia/i;

export const isBotUserAgent = (ua: string | null | undefined) => !ua || ua.length < 10 || BOT_UA.test(ua);
