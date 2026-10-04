import type { Design } from "../types";
import { HEAD, ROWH, W, bbox, edgeGeometry, tableHeight } from "./geometry";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (s: string, max: number) => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + "…" : s);

const KEY = '<circle cx="4.2" cy="7" r="2.6"/><path d="M6.8 7h5.7M10.6 7v2.2M12.5 7v1.6"/>';
const LINK = '<path d="M5.6 8.4 8.4 5.6"/><path d="M6.3 3.9 7.2 3a2.4 2.4 0 0 1 3.4 3.4l-.9.9M7.7 10.1l-.9.9A2.4 2.4 0 0 1 3.4 7.6l.9-.9"/>';

// The whole diagram as a standalone SVG, using the colors of the current theme.
export function diagramSvg(design: Design): { svg: string; width: number; height: number } {
  const css = getComputedStyle(document.querySelector(".app") || document.body);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const font = v("--font").replace(/"/g, "'"), mono = v("--mono").replace(/"/g, "'");
  const pad = 40;
  const notes = design.notes || [];
  const NOTE_W = 184;
  const noteLines = (text: string) => text.split("\n").flatMap((l) => l.match(/.{1,28}(\s|$)|.{1,28}/g) || [""]);
  const noteH = (text: string) => 16 + 14 + noteLines(text).length * 17;
  let b = design.tables.length ? bbox(design.tables) : { x: 0, y: 0, w: 400, h: 200 };
  if (notes.length) {
    // Grow the frame so notes outside the tables are not cut off.
    const first = design.tables.length ? b : { x: notes[0].x, y: notes[0].y, w: NOTE_W, h: 40 };
    let x0 = first.x, y0 = first.y, x1 = first.x + first.w, y1 = first.y + first.h;
    notes.forEach((n) => { x0 = Math.min(x0, n.x - 16); y0 = Math.min(y0, n.y - 16); x1 = Math.max(x1, n.x + NOTE_W + 16); y1 = Math.max(y1, n.y + noteH(n.text) + 16); });
    b = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const width = Math.ceil(b.w + pad * 2), height = Math.ceil(b.h + pad * 2);
  const fk = new Set(design.rels.map((r) => r.from.t + "." + r.from.c));
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${b.x - pad} ${b.y - pad} ${width} ${height}" font-family="${font}" font-size="12">`);
  out.push(`<rect x="${b.x - pad}" y="${b.y - pad}" width="${width}" height="${height}" fill="${v("--canvas")}"/>`);
  edgeGeometry(design.tables, design.rels).forEach((e) => {
    out.push(`<g fill="none" stroke="${v("--line")}" stroke-width="1.25"><path d="${e.d}"/><path d="${e.marks}"/>${e.opt ? `<path d="${e.opt}" fill="${v("--canvas")}"/>` : ""}</g>`);
  });
  design.tables.forEach((t) => {
    const h = tableHeight(t);
    out.push(`<g transform="translate(${t.x} ${t.y})">`);
    out.push(`<rect width="${W}" height="${h}" rx="6" fill="${v("--surface")}" stroke="${v("--border-2")}"/>`);
    out.push(`<path d="M0.5 ${HEAD - 0.5}V6a5.5 5.5 0 0 1 5.5-5.5H${W - 6}a5.5 5.5 0 0 1 5.5 5.5V${HEAD - 0.5}z" fill="${v("--surface-2")}"/>`);
    out.push(`<path d="M0 ${HEAD - 0.5}H${W}" stroke="${v("--border")}"/>`);
    out.push(`<text x="10" y="21" font-size="12.5" font-weight="600" fill="${v("--text")}">${esc(clip(t.name, 26))}</text>`);
    out.push(`<text x="${W - 8}" y="21" font-size="11" text-anchor="end" fill="${v("--text-3")}">${t.cols.length}</text>`);
    t.cols.forEach((c, i) => {
      const y = HEAD + i * ROWH;
      const isFk = fk.has(t.id + "." + c.id);
      if (c.pk || isFk) out.push(`<g transform="translate(7 ${y + 6}) scale(${12 / 14})" fill="none" stroke="${v(c.pk ? "--pk" : "--fk")}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${c.pk ? KEY : LINK}</g>`);
      const typeW = c.type.length * 6.1;
      const room = Math.floor((W - 40 - typeW - 6 - 26) / 6.4);
      out.push(`<text x="26" y="${y + 16}" fill="${v("--text")}"${c.pk ? ' font-weight="600"' : ""}>${esc(clip(c.name, Math.max(4, room)))}</text>`);
      out.push(`<text x="${W - 34}" y="${y + 16}" font-family="${mono}" font-size="11" text-anchor="end" fill="${v("--text-3")}">${esc(c.type)}</text>`);
      if (c.nullable) out.push(`<text x="${W - 28}" y="${y + 16}" font-family="${mono}" font-size="11" fill="${v("--text-3")}">?</text>`);
      if (c.unique && !c.pk) out.push(`<text x="${W - 14}" y="${y + 15.5}" font-size="9" font-weight="700" text-anchor="middle" fill="${v("--text-2")}">U</text>`);
    });
    out.push("</g>");
  });
  notes.forEach((n) => {
    out.push(`<g transform="translate(${n.x} ${n.y})"><rect width="${NOTE_W}" height="${noteH(n.text)}" rx="4" fill="${v("--note")}"/><rect width="${NOTE_W}" height="16" rx="4" fill="${v("--note-h")}"/>`);
    noteLines(n.text).forEach((l, i) => out.push(`<text x="8" y="${34 + i * 17}" fill="${v("--note-text")}">${esc(l.trim())}</text>`));
    out.push("</g>");
  });
  out.push("</svg>");
  return { svg: out.join(""), width, height };
}

export async function diagramPng(design: Design, scale = 2): Promise<Uint8Array> {
  const { svg, width, height } = diagramSvg(design);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("Could not render the diagram")); img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = width * scale; canvas.height = height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) throw new Error("Could not encode the image");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
