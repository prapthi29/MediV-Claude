// A small text-only PDF writer, so a patient can download a typed record or
// prescription as a document without pulling in a PDF library.
//
// blocks: [{ type: "title" | "heading" | "text" | "muted" | "row", text, label }]

const PAGE_W = 595; // A4 in points
const PAGE_H = 842;
const MARGIN = 56;
const STYLES = {
  title: { font: "F2", size: 18, gap: 10 },
  heading: { font: "F2", size: 12, gap: 6, before: 12 },
  text: { font: "F1", size: 10.5, gap: 3 },
  muted: { font: "F1", size: 9.5, gap: 3 },
  row: { font: "F1", size: 10.5, gap: 3, after: 5 },
};

// Helvetica is roughly half an em wide on average; wrap on that estimate.
function wrap(text, size, width) {
  const maxChars = Math.max(10, Math.floor(width / (size * 0.5)));
  const lines = [];
  for (const paragraph of String(text ?? "").split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if ((line + " " + word).length <= maxChars) line += " " + word;
      else {
        lines.push(line);
        line = word;
      }
      while (line.length > maxChars) {
        lines.push(line.slice(0, maxChars));
        line = line.slice(maxChars);
      }
    }
    lines.push(line);
  }
  return lines;
}

// PDF strings use WinAnsi here: keep Latin-1, escape the delimiters.
function pdfString(text) {
  const safe = String(text)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/·/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
  return "(" + safe.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)") + ")";
}

function layout(blocks) {
  const pages = [[]];
  let y = PAGE_H - MARGIN;
  const width = PAGE_W - MARGIN * 2;

  for (const block of blocks) {
    const style = STYLES[block.type] || STYLES.text;
    if (style.before) y -= style.before;
    const labelWidth = block.type === "row" ? 150 : 0;
    const lines = wrap(block.text, style.size, width - labelWidth);
    lines.forEach((line, i) => {
      if (y - style.size < MARGIN) {
        pages.push([]);
        y = PAGE_H - MARGIN;
      }
      y -= style.size + style.gap;
      const page = pages[pages.length - 1];
      if (block.type === "row" && i === 0) {
        page.push({ font: "F2", size: style.size, x: MARGIN, y, text: block.label || "" });
      }
      page.push({
        font: style.font,
        size: style.size,
        x: MARGIN + labelWidth,
        y,
        text: line,
        grey: block.type === "muted",
      });
    });
    if (style.after) y -= style.after;
    if (block.type === "title") {
      y -= 6;
      pages[pages.length - 1].push({ rule: true, y });
      y -= 8;
    }
  }
  return pages;
}

export function makeTextPdf(blocks) {
  const pages = layout(blocks);
  const objects = [];
  const add = (body) => objects.push(body) && objects.length;

  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(""); // pages tree, filled in below
  const regular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  const pageIds = pages.map((items, index) => {
    const ops = items.map((item) =>
      item.rule
        ? `0.8 0.85 0.84 RG 0.8 w ${MARGIN} ${item.y.toFixed(1)} m ${PAGE_W - MARGIN} ${item.y.toFixed(1)} l S`
        : `BT ${item.grey ? "0.36 0.48 0.46" : "0.09 0.19 0.17"} rg /${item.font} ${item.size} Tf ${item.x} ${item.y.toFixed(1)} Td ${pdfString(item.text)} Tj ET`
    );
    ops.push(`BT 0.36 0.48 0.46 rg /F1 8.5 Tf ${MARGIN} 32 Td ${pdfString(`MediVault - page ${index + 1} of ${pages.length}`)} Tj ET`);
    const stream = ops.join("\n");
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    return add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`
    );
  });
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const offset = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  // Every character is a single byte (Latin-1), so offsets above are byte offsets.
  const bytes = Uint8Array.from(out, (c) => c.charCodeAt(0) & 0xff);
  return new Blob([bytes], { type: "application/pdf" });
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name, ext) {
  const base = String(name || "document").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "document";
  return `${base}.${ext}`;
}
