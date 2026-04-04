// ---------------------------------------------------------------------------
// FigureExporter.ts -- Export composed SVG figures to multiple formats
// ---------------------------------------------------------------------------

export type ExportFormat = 'svg' | 'png' | 'tiff' | 'pdf' | 'eps';

export interface ExportConfig {
  svg: string;
  format: ExportFormat;
  dpi?: number;
  filename?: string;
  widthMm?: number;
  heightMm?: number;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
}

// ---------------------------------------------------------------------------
// Main export dispatcher
// ---------------------------------------------------------------------------

/**
 * Export a composed SVG figure to the requested format.
 */
export async function exportFigure(config: ExportConfig): Promise<ExportResult> {
  const dpi = config.dpi ?? 300;
  const filename = config.filename ?? `figure.${config.format}`;

  switch (config.format) {
    case 'svg':
      return exportSVG(config.svg, filename);
    case 'png':
      return exportPNG(config.svg, dpi, config.widthMm, config.heightMm, filename);
    case 'tiff':
      return exportTIFF(config.svg, dpi, config.widthMm, config.heightMm, filename);
    case 'pdf':
      return exportPDF(config.svg, config.widthMm, config.heightMm, filename);
    case 'eps':
      return exportEPS(config.svg, config.widthMm, config.heightMm, filename);
    default:
      throw new Error(`Unsupported export format: ${config.format}`);
  }
}

// ---------------------------------------------------------------------------
// SVG export
// ---------------------------------------------------------------------------

function exportSVG(svg: string, filename: string): ExportResult {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  return { blob, filename, mimeType: 'image/svg+xml' };
}

// ---------------------------------------------------------------------------
// PNG export
// ---------------------------------------------------------------------------

async function exportPNG(
  svg: string,
  dpi: number,
  widthMm?: number,
  heightMm?: number,
  filename = 'figure.png',
): Promise<ExportResult> {
  const { widthPx, heightPx } = computePixelDims(svg, dpi, widthMm, heightMm);
  const canvas = await renderSVGToCanvas(svg, widthPx, heightPx);

  const blob = await new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob returned null'))),
      'image/png',
    );
  });

  return { blob, filename, mimeType: 'image/png' };
}

// ---------------------------------------------------------------------------
// TIFF export (uncompressed RGB)
// ---------------------------------------------------------------------------

async function exportTIFF(
  svg: string,
  dpi: number,
  widthMm?: number,
  heightMm?: number,
  filename = 'figure.tiff',
): Promise<ExportResult> {
  const { widthPx, heightPx } = computePixelDims(svg, dpi, widthMm, heightMm);
  const canvas = await renderSVGToCanvas(svg, widthPx, heightPx);

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Failed to get canvas 2d context');
  const imageData = ctx.getImageData(0, 0, widthPx, heightPx);

  const tiffBytes = encodeTIFF(imageData.data, widthPx, heightPx, dpi);
  const blob = new Blob([tiffBytes as unknown as BlobPart], { type: 'image/tiff' });
  return { blob, filename, mimeType: 'image/tiff' };
}

/**
 * Encode raw RGBA pixel data as an uncompressed RGB TIFF.
 *
 * Produces a valid baseline TIFF 6.0 file with a single IFD containing
 * the required tags for an uncompressed RGB image.
 */
export function encodeTIFF(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  dpi: number,
): Uint8Array {
  const samplesPerPixel = 3; // RGB
  const rowBytes = width * samplesPerPixel;
  const stripSize = rowBytes * height;

  // Convert RGBA -> RGB
  const rgb = new Uint8Array(stripSize);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }

  // IFD entries -- we'll have 12 tags
  const numTags = 12;
  const ifdOffset = 8; // right after header
  const ifdSize = 2 + numTags * 12 + 4; // count + entries + next IFD pointer
  const dataAreaOffset = ifdOffset + ifdSize;

  // Values that don't fit in 4 bytes go into the data area
  // BitsPerSample: 3 SHORT values = 6 bytes
  const bpsOffset = dataAreaOffset;
  // XResolution: RATIONAL (8 bytes)
  const xResOffset = bpsOffset + 6;
  // YResolution: RATIONAL (8 bytes)
  const yResOffset = xResOffset + 8;
  // StripOffsets value (the actual pixel data starts after data area)
  const stripDataOffset = yResOffset + 8;

  const totalSize = stripDataOffset + stripSize;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // -- TIFF Header (8 bytes) --
  // Byte order: little-endian ("II")
  view.setUint8(0, 0x49); // 'I'
  view.setUint8(1, 0x49); // 'I'
  view.setUint16(2, 42, true); // magic number
  view.setUint32(4, ifdOffset, true); // offset to first IFD

  // -- IFD --
  let off = ifdOffset;
  view.setUint16(off, numTags, true);
  off += 2;

  // Helper to write an IFD entry
  function writeTag(tag: number, type: number, count: number, value: number): void {
    view.setUint16(off, tag, true);
    off += 2;
    view.setUint16(off, type, true);
    off += 2;
    view.setUint32(off, count, true);
    off += 4;
    // Value/offset field (4 bytes)
    if (type === 3 && count === 1) {
      // SHORT fits in 4 bytes
      view.setUint16(off, value, true);
      view.setUint16(off + 2, 0, true);
    } else {
      view.setUint32(off, value, true);
    }
    off += 4;
  }

  // Tags must be in ascending order
  writeTag(256, 3, 1, width);                // ImageWidth (SHORT)
  writeTag(257, 3, 1, height);               // ImageLength (SHORT)
  writeTag(258, 3, 3, bpsOffset);            // BitsPerSample -> offset
  writeTag(259, 3, 1, 1);                    // Compression: None
  writeTag(262, 3, 1, 2);                    // PhotometricInterpretation: RGB
  writeTag(273, 4, 1, stripDataOffset);      // StripOffsets (LONG)
  writeTag(277, 3, 1, samplesPerPixel);      // SamplesPerPixel
  writeTag(278, 4, 1, height);               // RowsPerStrip (entire image)
  writeTag(279, 4, 1, stripSize);            // StripByteCounts
  writeTag(282, 5, 1, xResOffset);           // XResolution -> offset
  writeTag(283, 5, 1, yResOffset);           // YResolution -> offset
  writeTag(296, 3, 1, 2);                    // ResolutionUnit: inch

  // Next IFD offset = 0 (no more IFDs)
  view.setUint32(off, 0, true);

  // -- Data area --
  // BitsPerSample: [8, 8, 8]
  view.setUint16(bpsOffset, 8, true);
  view.setUint16(bpsOffset + 2, 8, true);
  view.setUint16(bpsOffset + 4, 8, true);

  // XResolution: dpi as RATIONAL (numerator/denominator)
  view.setUint32(xResOffset, dpi, true);
  view.setUint32(xResOffset + 4, 1, true);

  // YResolution
  view.setUint32(yResOffset, dpi, true);
  view.setUint32(yResOffset + 4, 1, true);

  // -- Pixel data (RGB strip) --
  bytes.set(rgb, stripDataOffset);

  return bytes;
}

// ---------------------------------------------------------------------------
// PDF export (minimal valid PDF with embedded image)
// ---------------------------------------------------------------------------

async function exportPDF(
  svg: string,
  widthMm?: number,
  heightMm?: number,
  filename = 'figure.pdf',
): Promise<ExportResult> {
  const dims = extractSVGDims(svg);
  const wMm = widthMm ?? dims.widthMm;
  const hMm = heightMm ?? dims.heightMm;

  // PDF units are 1/72 inch. 1 mm = 72/25.4 pt
  const mmToPt = 72 / 25.4;
  const wPt = wMm * mmToPt;
  const hPt = hMm * mmToPt;

  // Render to PNG first for embedding
  const pngDpi = 300;
  const wPx = Math.round(wMm * pngDpi / 25.4);
  const hPx = Math.round(hMm * pngDpi / 25.4);
  const canvas = await renderSVGToCanvas(svg, wPx, hPx);

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Failed to get canvas 2d context');
  const imageData = ctx.getImageData(0, 0, wPx, hPx);

  // Extract RGB stream (no alpha for PDF)
  const rgbLen = wPx * hPx * 3;
  const rgbStream = new Uint8Array(rgbLen);
  for (let i = 0, j = 0; i < imageData.data.length; i += 4, j += 3) {
    rgbStream[j] = imageData.data[i];
    rgbStream[j + 1] = imageData.data[i + 1];
    rgbStream[j + 2] = imageData.data[i + 2];
  }

  // Build PDF
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;

  function write(s: string): void {
    const b = encoder.encode(s);
    parts.push(b);
    pos += b.length;
  }

  function writeBytes(b: Uint8Array): void {
    parts.push(b);
    pos += b.length;
  }

  function markObj(): void {
    offsets.push(pos);
  }

  // Header
  write('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // Object 1: Catalog
  markObj();
  write('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages
  markObj();
  write(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`);

  // Object 3: Page
  markObj();
  write(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R ` +
    `/MediaBox [0 0 ${wPt.toFixed(2)} ${hPt.toFixed(2)}] ` +
    `/Contents 4 0 R /Resources << /XObject << /Img0 5 0 R >> >> >>\nendobj\n`,
  );

  // Object 4: Content stream (draw image)
  const contentStream = `q\n${wPt.toFixed(2)} 0 0 ${hPt.toFixed(2)} 0 0 cm\n/Img0 Do\nQ\n`;
  markObj();
  write(
    `4 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`,
  );

  // Object 5: Image XObject
  markObj();
  write(
    `5 0 obj\n<< /Type /XObject /Subtype /Image ` +
    `/Width ${wPx} /Height ${hPx} ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
    `/Length ${rgbLen} >>\nstream\n`,
  );
  writeBytes(rgbStream);
  write('\nendstream\nendobj\n');

  // Cross-reference table
  const xrefPos = pos;
  write('xref\n');
  write(`0 ${offsets.length + 1}\n`);
  write('0000000000 65535 f \n');
  for (const o of offsets) {
    write(`${String(o).padStart(10, '0')} 00000 n \n`);
  }

  // Trailer
  write('trailer\n');
  write(`<< /Size ${offsets.length + 1} /Root 1 0 R >>\n`);
  write('startxref\n');
  write(`${xrefPos}\n`);
  write('%%EOF\n');

  // Combine
  const totalLen = parts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }

  const blob = new Blob([result], { type: 'application/pdf' });
  return { blob, filename, mimeType: 'application/pdf' };
}

// ---------------------------------------------------------------------------
// EPS export
// ---------------------------------------------------------------------------

async function exportEPS(
  svg: string,
  widthMm?: number,
  heightMm?: number,
  filename = 'figure.eps',
): Promise<ExportResult> {
  const dims = extractSVGDims(svg);
  const wMm = widthMm ?? dims.widthMm;
  const hMm = heightMm ?? dims.heightMm;

  // EPS bounding box in points (1 mm = 72/25.4 pt)
  const mmToPt = 72 / 25.4;
  const wPt = Math.round(wMm * mmToPt);
  const hPt = Math.round(hMm * mmToPt);

  // Render to canvas and get pixel data
  const pngDpi = 300;
  const wPx = Math.round(wMm * pngDpi / 25.4);
  const hPx = Math.round(hMm * pngDpi / 25.4);
  const canvas = await renderSVGToCanvas(svg, wPx, hPx);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Failed to get canvas 2d context');
  const imageData = ctx.getImageData(0, 0, wPx, hPx);

  // Build EPS with embedded RGB image using ASCII85 or hex encoding
  const lines: string[] = [];
  lines.push('%!PS-Adobe-3.0 EPSF-3.0');
  lines.push(`%%BoundingBox: 0 0 ${wPt} ${hPt}`);
  lines.push(`%%HiResBoundingBox: 0.0 0.0 ${(wMm * mmToPt).toFixed(4)} ${(hMm * mmToPt).toFixed(4)}`);
  lines.push('%%Creator: BioNetGen Web Simulator FigureExporter');
  lines.push('%%Pages: 1');
  lines.push('%%EndComments');
  lines.push('%%BeginProlog');
  lines.push('%%EndProlog');
  lines.push('%%Page: 1 1');
  lines.push('gsave');
  lines.push(`${(wMm * mmToPt).toFixed(4)} ${(hMm * mmToPt).toFixed(4)} scale`);
  lines.push(`${wPx} ${hPx} 8 [${wPx} 0 0 -${hPx} 0 ${hPx}]`);
  lines.push('{currentfile 3 mul string readhexstring pop} false 3 colorimage');

  // Encode pixel data as hex (pairs of hex digits, RGB only)
  const hexChars = '0123456789abcdef';
  let hexLine = '';
  for (let i = 0; i < imageData.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = imageData.data[i + c];
      hexLine += hexChars[v >> 4] + hexChars[v & 0x0f];
    }
    // Keep lines under ~72 chars for PS spec
    if (hexLine.length >= 72) {
      lines.push(hexLine);
      hexLine = '';
    }
  }
  if (hexLine.length > 0) {
    lines.push(hexLine);
  }

  lines.push('grestore');
  lines.push('showpage');
  lines.push('%%EOF');

  const epsContent = lines.join('\n');
  const blob = new Blob([epsContent], { type: 'application/postscript' });
  return { blob, filename, mimeType: 'application/postscript' };
}

// ---------------------------------------------------------------------------
// LaTeX snippet generator
// ---------------------------------------------------------------------------

/**
 * Generate a LaTeX figure environment snippet for inclusion in papers.
 */
export function generateLatexSnippet(
  filename: string,
  caption: string,
  label: string,
  width = '\\textwidth',
): string {
  return (
    '\\begin{figure}[ht]\n' +
    '  \\centering\n' +
    `  \\includegraphics[width=${width}]{${filename}}\n` +
    `  \\caption{${caption}}\n` +
    `  \\label{fig:${label}}\n` +
    '\\end{figure}'
  );
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

/**
 * Download an ExportResult via the browser, following the pattern from
 * src/utils/download.ts.
 */
export function downloadFigure(result: ExportResult): void {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MM_TO_PX = 3.7795275591;

interface SVGDims {
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
}

function extractSVGDims(svg: string): SVGDims {
  // Try width/height in mm
  const wMmMatch = svg.match(/\bwidth\s*=\s*"([\d.]+)mm"/);
  const hMmMatch = svg.match(/\bheight\s*=\s*"([\d.]+)mm"/);
  if (wMmMatch && hMmMatch) {
    const wMm = parseFloat(wMmMatch[1]);
    const hMm = parseFloat(hMmMatch[1]);
    return { widthMm: wMm, heightMm: hMm, widthPx: wMm * MM_TO_PX, heightPx: hMm * MM_TO_PX };
  }

  // Try viewBox
  const vbMatch = svg.match(/viewBox\s*=\s*"([^"]+)"/);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length >= 4) {
      const wPx = parts[2];
      const hPx = parts[3];
      return { widthMm: wPx / MM_TO_PX, heightMm: hPx / MM_TO_PX, widthPx: wPx, heightPx: hPx };
    }
  }

  // Fallback
  return { widthMm: 178, heightMm: 120, widthPx: 178 * MM_TO_PX, heightPx: 120 * MM_TO_PX };
}

function computePixelDims(
  svg: string,
  dpi: number,
  widthMm?: number,
  heightMm?: number,
): { widthPx: number; heightPx: number } {
  const dims = extractSVGDims(svg);
  const wMm = widthMm ?? dims.widthMm;
  const hMm = heightMm ?? dims.heightMm;
  return {
    widthPx: Math.round(wMm * dpi / 25.4),
    heightPx: Math.round(hMm * dpi / 25.4),
  };
}

/**
 * Render an SVG string to an OffscreenCanvas (or regular canvas) at the
 * specified pixel dimensions.
 */
function renderSVGToCanvas(
  svg: string,
  widthPx: number,
  heightPx: number,
): Promise<HTMLCanvasElement | OffscreenCanvas> {
  return new Promise((resolve, reject) => {
    // Use Blob URL instead of deprecated btoa(unescape(...)) for Unicode safety
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = widthPx;
      canvas.height = heightPx;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to create canvas 2d context'));
        return;
      }
      ctx.drawImage(img, 0, 0, widthPx, heightPx);
      resolve(canvas);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load SVG image: ${err}`));
    };
    img.src = url;
  });
}
