import { printDocumentHtml, saveDocumentPdfFromHtml, shareDocumentWhatsApp } from "@/utils/printAndPdf";
import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Printer, FileDown, Share2 } from "lucide-react";

interface ThermalBatchLabelProps {
  productNameAr: string;
  productNameEn: string;
  batchNumber: string;
  productionDate: string;
  expiryDate: string;
  sku: string;
  widthMm?: number;
  heightMm?: number;
  compact?: boolean;
}

export function ThermalBatchLabel({
  productNameAr,
  productNameEn,
  batchNumber,
  productionDate,
  expiryDate,
  sku,
  widthMm = 50,
  heightMm = 30,
  compact = false,
}: ThermalBatchLabelProps) {
  const { i18n } = useTranslation();
  const printRef = useRef<HTMLDivElement>(null);
  const isAr = i18n.language === "ar";

  
  const getDocumentHtml = (contentHtml: string, docTitle: string = "document") => {
    return `
      <!DOCTYPE html>
      <html dir="${isAr ? "rtl" : "ltr"}" lang="${isAr ? "ar" : "en"}">
        <head>
          <meta charset="utf-8" />
          <title>${docTitle}</title>
          <style>
            @page {
              size: ${widthMm}mm ${heightMm}mm;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 2mm;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              width: ${widthMm}mm;
              height: ${heightMm}mm;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              background: #fff;
              color: #000;
              font-size: 8px;
              line-height: 1.1;
            }
            .header {
              border-bottom: 1px solid #000;
              padding-bottom: 1mm;
              margin-bottom: 1mm;
            }
            .title-ar {
              font-weight: bold;
              font-size: 8.5px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .title-en {
              font-size: 7px;
              color: #333;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 1mm;
              font-size: 7.5px;
            }
            .font-mono {
              font-family: monospace;
              font-weight: bold;
            }
            .footer {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              border-top: 0.5px dashed #666;
              padding-top: 1mm;
              margin-top: 1mm;
            }
            .barcode-sim {
              font-family: monospace;
              letter-spacing: 2px;
              font-size: 7px;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          ${contentHtml}
          
        </body>
      </html>
    `;
  };

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    printDocumentHtml(getDocumentHtml(el.innerHTML, "document"), typeof "ملصق_تشغيلة" !== 'undefined' ? "ملصق_تشغيلة" : "document");
  };

  const handleSavePdf = () => {
    const el = printRef.current;
    if (!el) return;
    saveDocumentPdfFromHtml(getDocumentHtml(el.innerHTML, "document"), typeof "ملصق_تشغيلة" !== 'undefined' ? "ملصق_تشغيلة" : "document");
  };

  const handleShareWhatsApp = () => {
    const msg = `*بيانات ملصق تشغيل الباتش*
المنتج: ${productNameAr}
رقم الباتش: ${batchNumber}
رمز الصنف (SKU): ${sku}
تاريخ الإنتاج: ${productionDate}
تاريخ الانتهاء: ${expiryDate}
_مصنع الأسياح للمنتجات الكيميائية_`;

    const encoded = encodeURIComponent(msg);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(waUrl, "_blank");
  };

  return (
    <div className="space-y-3">
      {/* Visual Preview on Screen */}
      <div
        ref={printRef}
        className="border border-slate-900 bg-white p-2 rounded text-slate-900 select-none shadow-sm flex flex-col justify-between"
        style={{ width: `${widthMm * 3.8}px`, minHeight: `${heightMm * 3.8}px` }}
      >
        <div className="header border-b border-slate-900 pb-1 mb-1">
          <div className="font-bold text-[11px] leading-tight truncate">{productNameAr}</div>
          <div className="text-[9px] text-slate-600 truncate">{productNameEn}</div>
        </div>

        <div className="grid grid-cols-2 gap-1 text-[9px] leading-snug">
          <div>
            <span className="text-slate-500 block text-[8px]">{isAr ? "رقم الباتش:" : "Batch #:"}</span>
            <span className="font-mono font-bold text-slate-900">{batchNumber}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[8px]">{isAr ? "رمز الصنف:" : "SKU:"}</span>
            <span className="font-mono text-slate-900">{sku}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[8px]">{isAr ? "تاريخ الإنتاج:" : "Prod Date:"}</span>
            <span className="font-mono">{productionDate}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[8px]">{isAr ? "تاريخ الانتهاء:" : "Exp Date:"}</span>
            <span className="font-mono font-bold text-slate-900">{expiryDate}</span>
          </div>
        </div>

        <div className="border-t border-dashed border-slate-400 pt-1 mt-1 flex justify-between items-center text-[8px] text-slate-500">
          <span>{isAr ? "مصنع الأسياح للمنظفات" : "Al-Asyah Factory"}</span>
          <span className="font-mono font-bold tracking-widest text-[9px] text-slate-900">*{batchNumber}*</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* 1. Print Button */}
        <Button
          onClick={handlePrint}
          size="sm"
          variant="outline"
          className="flex-1 min-w-[120px] gap-1.5 text-xs h-8 border-slate-300 text-slate-800 hover:bg-slate-100"
          title={isAr ? `طباعة الملصق الحراري (${widthMm}×${heightMm} مم)` : `Print Label (${widthMm}x${heightMm} mm)`}
        >
          <Printer className="w-3.5 h-3.5 text-slate-600" />
          <span>{compact ? "طباعة" : isAr ? `طباعة حرارية` : `Print Label`}</span>
        </Button>

        {/* 2. Save PDF Button */}
        <Button
          onClick={handleSavePdf}
          size="sm"
          variant="tonal"
          className="h-8 px-2.5 gap-1.5 text-xs font-semibold"
          title="حفظ الملصق كملف PDF"
        >
          <FileDown className="w-3.5 h-3.5 text-sky-700" />
          <span>PDF</span>
        </Button>

        {/* 3. Share WhatsApp Button */}
        <Button
          onClick={handleShareWhatsApp}
          size="sm"
          variant="emerald"
          className="h-8 px-2.5 gap-1.5 text-xs"
          title="مشاركة تفاصيل الملصق عبر واتساب"
        >
          <Share2 className="w-3.5 h-3.5 text-emerald-100" />
          <span>واتساب</span>
        </Button>
      </div>
    </div>
  );
}
