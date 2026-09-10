import type { ReceiptItem } from "./gemini";

const SHEET_NAME = "Receipt Savior";
const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";
const HEADER_ROW = [
  "Name",
  "Quantity",
  "Unit Price",
  "Total Price",
  "Category",
  "Vendor",
  "Date",
  "Subtotal",
  "HST",
  "Total Tax",
  "Grand Total",
];

async function driveFetch(accessToken: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Drive API failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sheetsFetch(accessToken: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://sheets.googleapis.com/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Sheets API failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Finds (or creates, with a header row) the "Receipt Savior" sheet inside the given folder. */
export async function ensureSheet(accessToken: string, folderId: string): Promise<string> {
  const query = encodeURIComponent(
    `name='${SHEET_NAME}' and mimeType='${SPREADSHEET_MIME}' and '${folderId}' in parents and trashed=false`
  );
  const found = await driveFetch(accessToken, `/files?q=${query}&fields=files(id,name)`);
  if (found.files?.length) return found.files[0].id;

  const created = await driveFetch(accessToken, "/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: SHEET_NAME, mimeType: SPREADSHEET_MIME, parents: [folderId] }),
  });

  await sheetsFetch(accessToken, `/spreadsheets/${created.id}/values/A1:K1?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [HEADER_ROW] }),
  });

  return created.id;
}

/** Appends one row per receipt item to the sheet. */
export async function appendItems(
  accessToken: string,
  spreadsheetId: string,
  items: ReceiptItem[]
) {
  const values = items.map((item) => [
    item.name,
    item.quantity,
    item.unitPrice,
    item.totalPrice,
    item.category,
    item.vendor,
    item.date,
    item.subtotal,
    item.hst,
    item.totalTax,
    item.grandTotal,
  ]);
  await sheetsFetch(
    accessToken,
    `/spreadsheets/${spreadsheetId}/values/A:K:append?valueInputOption=RAW`,
    {
      method: "POST",
      body: JSON.stringify({ values }),
    }
  );
}
