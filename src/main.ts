import "./style.css";
import { getAccessToken, initSignIn } from "./auth";

interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category: string;
  vendor: string;
  date: string;
  subtotal: number;
  hst: number | null;
  totalTax: number;
  grandTotal: number;
}

interface ProcessReceiptResponse {
  items: ReceiptItem[];
}

const uploadSection = document.getElementById("upload-section") as HTMLElement;
const receiptInput = document.getElementById("receipt-input") as HTMLInputElement;
const status = document.getElementById("status") as HTMLElement;
const results = document.getElementById("results") as HTMLElement;

initSignIn(() => {
  uploadSection.hidden = false;
});

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function renderItems(items: ReceiptItem[]): void {
  results.innerHTML = "";
  const table = document.createElement("table");

  const headerRow = document.createElement("tr");
  for (const heading of [
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
  ]) {
    const th = document.createElement("th");
    th.textContent = heading;
    headerRow.appendChild(th);
  }
  table.appendChild(headerRow);

  for (const item of items) {
    const row = document.createElement("tr");
    for (const value of [
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
    ]) {
      const td = document.createElement("td");
      td.textContent = String(value);
      row.appendChild(td);
    }
    table.appendChild(row);
  }

  results.appendChild(table);
}

receiptInput.addEventListener("change", async () => {
  const file = receiptInput.files?.[0];
  if (!file) {
    return;
  }

  const accessToken = getAccessToken();
  results.innerHTML = "";
  status.textContent = "Processing…";

  try {
    const imageBase64 = await readFileAsBase64(file);
    const response = await fetch("/api/process-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, imageBase64, mimeType: file.type }),
    });

    if (!response.ok) {
      status.textContent = await response.text();
      return;
    }

    const data = (await response.json()) as ProcessReceiptResponse;
    renderItems(data.items);
    status.textContent = "Saved to Google Sheets.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
