const FOLDER_NAME = "Receipt Savior";
const FOLDER_MIME = "application/vnd.google-apps.folder";

async function driveFetch(accessToken: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Drive API failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Finds (or creates) the shared "Receipt Savior" Drive folder for the signed-in user. */
export async function ensureFolder(accessToken: string): Promise<string> {
  const query = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`
  );
  const found = await driveFetch(accessToken, `/files?q=${query}&fields=files(id,name)`);
  if (found.files?.length) return found.files[0].id;

  const created = await driveFetch(accessToken, "/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
  return created.id;
}

/** Uploads the receipt image into the given folder. */
export async function uploadImage(
  accessToken: string,
  folderId: string,
  imageBase64: string,
  mimeType: string,
  fileName: string
) {
  const boundary = "receipt_savior_boundary";
  const metadata = { name: fileName, parents: [folderId] };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${imageBase64}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`);
  return res.json();
}
