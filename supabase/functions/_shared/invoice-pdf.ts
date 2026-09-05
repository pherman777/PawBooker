import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1';

export type InvoiceLineItem = {
  description: string;
  amount_cents: number;
};

export type InvoiceDetails = {
  groomerName: string;
  petName: string;
  serviceName: string;
  customerEmail: string;
  date: Date;
  lineItems: InvoiceLineItem[];
  taxAmountCents: number;
  tipAmountCents: number;
  totalCents: number;
};

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function generateInvoicePdf(invoice: InvoiceDetails): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.45, 0.45, 0.48);
  const tint = rgb(0.18, 0.4, 0.56);

  let y = 780;
  const marginX = 56;
  const pageWidth = 595;

  function text(value: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}) {
    page.drawText(value, {
      x: opts.x ?? marginX,
      y,
      size: opts.size ?? 11,
      font: opts.bold ? boldFont : font,
      color: opts.color ?? dark,
    });
  }

  text('PawBooker', { size: 24, bold: true, color: tint });
  y -= 20;
  text('Invoice', { size: 14, bold: true, color: muted });
  y -= 36;

  text(`Groomer: ${invoice.groomerName}`, { size: 12 });
  y -= 18;
  text(`Pet: ${invoice.petName}`, { size: 12 });
  y -= 18;
  text(`Service: ${invoice.serviceName}`, { size: 12 });
  y -= 18;
  text(`Billed to: ${invoice.customerEmail}`, { size: 12 });
  y -= 18;
  text(
    `Date: ${invoice.date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    { size: 12 }
  );
  y -= 36;

  page.drawLine({
    start: { x: marginX, y },
    end: { x: pageWidth - marginX, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.87),
  });
  y -= 24;

  text('Description', { size: 11, bold: true, color: muted });
  text('Amount', { size: 11, bold: true, color: muted, x: pageWidth - marginX - 70 });
  y -= 20;

  for (const item of invoice.lineItems) {
    text(item.description, { size: 12 });
    text(formatCurrency(item.amount_cents), { size: 12, x: pageWidth - marginX - 70 });
    y -= 22;
  }

  y -= 6;
  page.drawLine({
    start: { x: marginX, y },
    end: { x: pageWidth - marginX, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.87),
  });
  y -= 24;

  if (invoice.taxAmountCents > 0 || invoice.tipAmountCents > 0) {
    const subtotalCents = invoice.lineItems.reduce((sum, item) => sum + item.amount_cents, 0);
    text('Subtotal', { size: 12, color: muted });
    text(formatCurrency(subtotalCents), { size: 12, color: muted, x: pageWidth - marginX - 70 });
    y -= 20;
    if (invoice.taxAmountCents > 0) {
      text('Sales tax', { size: 12, color: muted });
      text(formatCurrency(invoice.taxAmountCents), { size: 12, color: muted, x: pageWidth - marginX - 70 });
      y -= 20;
    }
    if (invoice.tipAmountCents > 0) {
      text('Tip', { size: 12, color: muted });
      text(formatCurrency(invoice.tipAmountCents), { size: 12, color: muted, x: pageWidth - marginX - 70 });
      y -= 20;
    }
    y -= 6;
  }

  text('Total', { size: 14, bold: true });
  text(formatCurrency(invoice.totalCents), { size: 14, bold: true, x: pageWidth - marginX - 80 });
  y -= 40;

  text('Thank you for booking with PawBooker!', { size: 11, color: muted });

  return pdfDoc.save();
}
