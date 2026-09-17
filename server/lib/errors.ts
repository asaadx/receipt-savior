/**
 * An error whose message is safe to show the user.
 *
 * Everything else is treated as an internal fault: logged in full server-side,
 * reported to the client as a generic message plus a request id. Google API
 * failures in `drive.ts`/`sheets.ts` embed raw upstream response bodies in
 * their messages, so returning arbitrary `err.message` to the browser leaks
 * internals.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "AppError";
  }
}
