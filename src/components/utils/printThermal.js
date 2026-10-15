// function/printThermal.js
// Prints an HTML string on a 58mm thermal printer (POS-58) using a hidden iframe.
// No popup, and the app's own CSS can't interfere.

// Printable width of a POS-58. If the right edge still clips, use 46.
export const WIDTH_MM = 44;

const BASE_CSS = `
  @page { size: 58mm auto; margin: 0; }
  *, *::before, *::after {
    box-sizing: border-box;
    color: #000 !important;
    background: transparent !important;
    opacity: 1 !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }
  html, body { margin: 0; padding: 0; background: #fff !important; }
body {
  width: ${WIDTH_MM}mm;
  margin: 0;                 /* was: 0 auto, which centered it in the wider driver page */
  padding: 1mm 0 8mm 0;
  font-family: 'Courier New', monospace;
  font-weight: 700;          /* thin strokes print faint on thermal paper */
  font-size: 11px;
  line-height: 1.35;
  word-break: break-word;
  overflow-wrap: anywhere;
}
  h1, h2, h3 { text-align: center; margin: 2px 0; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: 700; }
  .small { font-size: 10px; }
  .row { display: flex; justify-content: space-between; gap: 4px; }
  .row > span:first-child { min-width: 0; }
  .row > span:last-child { flex-shrink: 0; text-align: right; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  .solid { border-top: 1.5px solid #000; margin: 6px 0 4px; }
.qr { display: block; width: 34mm; height: 34mm; margin: 4px 0 2px 0; image-rendering: pixelated; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 1px 0; vertical-align: top; }
`;

export function printThermal(bodyHtml, { title = "Receipt", extraCss = "" } = {}) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win.document;
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
     <style>${BASE_CSS}${extraCss}</style></head><body>${bodyHtml}</body></html>`
  );
  doc.close();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => iframe.remove(), 300);
  };

  // Wait for images (QR codes) to finish loading before printing.
  const pending = [...doc.images]
    .filter((img) => !img.complete)
    .map((img) => new Promise((r) => { img.onload = img.onerror = r; }));

  Promise.all(pending).then(() => {
    setTimeout(() => {
      win.focus();
      win.onafterprint = cleanup;
      win.print();
      setTimeout(cleanup, 60000); // fallback
    }, 150);
  });
}