import "./style.css";
import { getAccessToken, initSignIn } from "./auth";
import type { ReceiptItem } from "../api/lib/schema.js";

interface ProcessReceiptResponse {
  items: ReceiptItem[];
}

const uploadSection = document.getElementById("upload-section") as HTMLElement;
const receiptInput = document.getElementById("receipt-input") as HTMLInputElement;
const status = document.getElementById("status") as HTMLElement;
const results = document.getElementById("results") as HTMLElement;
const themeToggle = document.getElementById("theme-toggle") as HTMLButtonElement;

const storedTheme = localStorage.getItem("theme");
if (storedTheme === "light" || storedTheme === "dark") {
  document.documentElement.dataset.theme = storedTheme;
}

themeToggle.addEventListener("click", () => {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const current = document.documentElement.dataset.theme ?? (prefersDark ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("theme", next);
});

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
  ]) {
    const th = document.createElement("th");
    th.textContent = heading;
    headerRow.appendChild(th);
  }
  table.appendChild(headerRow);

  items.forEach((item, index) => {
    const row = document.createElement("tr");
    const receiptWide =
      index === 0
        ? [item.receiptNumber ?? "", item.vendor, item.date, item.subtotal, item.hst ?? "", item.totalTax, item.grandTotal]
        : ["", "", "", "", "", "", ""];
    const values = [
      receiptWide[0],
      receiptWide[1],
      receiptWide[2],
      item.name,
      item.quantity,
      item.totalPrice,
      item.category,
      receiptWide[3],
      receiptWide[4],
      receiptWide[5],
      receiptWide[6],
    ];
    for (const value of values) {
      const td = document.createElement("td");
      td.textContent = String(value);
      row.appendChild(td);
    }
    table.appendChild(row);
  });

  results.appendChild(table);
}

receiptInput.addEventListener("change", async () => {
  const file = receiptInput.files?.[0];
  if (!file) {
    return;
  }

  const accessToken = getAccessToken();
  results.innerHTML = "";
  delete status.dataset.state;
  status.textContent = "Processing…";

  try {
    const imageBase64 = await readFileAsBase64(file);
    const response = await fetch("/api/process-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, imageBase64, mimeType: file.type }),
    });

    if (!response.ok) {
      status.dataset.state = "error";
      status.textContent = await response.text();
      return;
    }

    const data = (await response.json()) as ProcessReceiptResponse;
    renderItems(data.items);
    status.textContent = "Saved to Google Sheets.";
  } catch (error) {
    status.dataset.state = "error";
    status.textContent = error instanceof Error ? error.message : String(error);
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
