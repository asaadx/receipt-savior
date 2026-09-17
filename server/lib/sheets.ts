import type { ReceiptItem } from "../../shared/schema.js";

const SHEET_NAME = "Receipt Savior";
const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";
const HEADER_ROW = [
  "Receipt #",
  "Vendor",
  "Date",
  "Name",
  "Quantity",
  "Total Price",
  "Category",
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

async function getFirstSheetId(accessToken: string, spreadsheetId: string): Promise<number> {
  const data = (await sheetsFetch(accessToken, `/spreadsheets/${spreadsheetId}?fields=sheets.properties.sheetId`)) as {
    sheets?: Array<{ properties?: { sheetId?: number } }>;
  };
  const sheetId = data.sheets?.[0]?.properties?.sheetId;
  if (sheetId === undefined) throw new Error("Could not determine sheetId for spreadsheet");
  return sheetId;
}

/** Finds (or creates, with a header row) the "Receipt Savior" sheet inside the given folder. */
export async function ensureSheet(
  accessToken: string,
  folderId: string
): Promise<{ spreadsheetId: string; sheetId: number }> {
  const query = encodeURIComponent(
    `name='${SHEET_NAME}' and mimeType='${SPREADSHEET_MIME}' and '${folderId}' in parents and trashed=false`
  );
  const found = await driveFetch(accessToken, `/files?q=${query}&fields=files(id,name)`);

  let spreadsheetId: string;
  if (found.files?.length) {
    spreadsheetId = found.files[0].id;
  } else {
    const created = await driveFetch(accessToken, "/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: SHEET_NAME, mimeType: SPREADSHEET_MIME, parents: [folderId] }),
    });
    spreadsheetId = created.id;

    await sheetsFetch(accessToken, `/spreadsheets/${spreadsheetId}/values/A1:K1?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values: [HEADER_ROW] }),
    });
  }

  const sheetId = await getFirstSheetId(accessToken, spreadsheetId);
  return { spreadsheetId, sheetId };
}

/** Parses a Sheets API `updatedRange` (e.g. `'Receipt Savior'!A5:K7`) into zero-based row indices. */
function parseAppendedRowRange(updatedRange: string): { startIndex: number; endIndex: number } {
  const match = updatedRange.match(/![A-Z]+(\d+):[A-Z]+(\d+)$/);
  if (!match) throw new Error(`Could not parse appended row range: ${updatedRange}`);
  const firstRow = Number(match[1]);
  const lastRow = Number(match[2]);
  return { startIndex: firstRow - 1, endIndex: lastRow };
}

// One row per item in a collapsible group. Receipt-wide values are written
// only on the first row, so summing a column never overcounts.
export async function appendItems(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
  items: ReceiptItem[],
  imageLink: string
): Promise<void> {
  if (items.length === 0) return;

  const [first, ...rest] = items;
  const receiptLabel = first.receiptNumber ? first.receiptNumber.replace(/"/g, '""') : "Receipt";
  const receiptCell = `=HYPERLINK("${imageLink}", "${receiptLabel}")`;

  const values = [
    [
      receiptCell,
      first.vendor,
      first.date,
      first.name,
      first.quantity,
      first.totalPrice,
      first.category,
      first.subtotal,
      first.hst ?? "",
      first.totalTax,
      first.grandTotal,
    ],
    ...rest.map((item) => ["", "", "", item.name, item.quantity, item.totalPrice, item.category, "", "", "", ""]),
  ];

  const response = (await sheetsFetch(
    accessToken,
    `/spreadsheets/${spreadsheetId}/values/A:K:append?valueInputOption=USER_ENTERED`,
    { method: "POST", body: JSON.stringify({ values }) }
  )) as { updates?: { updatedRange?: string } };

  const requests: unknown[] = [
    { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: HEADER_ROW.length } } },
  ];

  const updatedRange = response.updates?.updatedRange;
  if (updatedRange && items.length > 1) {
    const { startIndex, endIndex } = parseAppendedRowRange(updatedRange);
    requests.unshift({ addDimensionGroup: { range: { sheetId, dimension: "ROWS", startIndex, endIndex } } });
  }

  await sheetsFetch(accessToken, `/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}
