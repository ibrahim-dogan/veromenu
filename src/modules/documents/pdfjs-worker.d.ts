// pdfjs-dist ships no typings for the worker entry; we only hand the module to pdfjs (globalThis.pdfjsWorker).
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
