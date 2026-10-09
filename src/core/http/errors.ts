/** Errors with an i18n code ("errors.<code>"). Safe to import anywhere (no Next.js deps). */
export class AppError extends Error {
  constructor(
    public code: string,
    public detail?: string,
  ) {
    super(code);
    this.name = "AppError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}
