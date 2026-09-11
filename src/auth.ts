declare const google: any;

const SCOPE =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";

interface TokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string }): void;
}

let accessToken: string | null = null;
let tokenClient: TokenClient | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function initSignIn(onSignedIn: () => void): void {
  const signInButton = document.getElementById("sign-in-button") as HTMLButtonElement;

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: (response: { access_token?: string }) => {
      if (!response.access_token) return;
      accessToken = response.access_token;
      signInButton.hidden = true;
      onSignedIn();
    },
  }) as TokenClient;

  signInButton.addEventListener("click", () => {
    tokenClient!.requestAccessToken();
  });

  // Best-effort silent reacquisition from the user's existing Google session,
  // so returning visitors aren't forced to click "Sign in" every time. No-ops
  // (leaving the sign-in button visible) if the browser blocks it or there's
  // no prior consent.
  tokenClient.requestAccessToken({ prompt: "" });
}
