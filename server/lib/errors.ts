// Message is safe to show the user. Everything else is an internal fault:
// Google errors embed raw upstream bodies that would leak internals.
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "AppError";
  }
}
