import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface ThermalBatchLabelProps {
  productNameAr: string;
  productNameEn: string;
  batchNumber: string;
  productionDate: string;
  expiryDate: string;
  sku: string;
  widthMm?: number;
  heightMm?: number;
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
}: ThermalBatchLabelProps) {
  const { i18n } = useTranslation();
  const printRef = useRef<HTMLDivElement>(null);
  const isAr = i18n.language === "ar";

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const win = window.open("", "_blank");
    if (!win) return;

    win.document.write(`
      <!DOCTYPE html>
      <html dir="${isAr ? "rtl" : "ltr"}">
        <head>
          <title>طباعة ملصق الباتش - ${batchNumber}</title>
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
          ${printContent.innerHTML}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();
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

      <Button onClick={handlePrint} size="sm" variant="outline" className="w-full gap-2 text-xs">
        <Printer className="w-4 h-4" />
        <span>{isAr ? `طباعة الملصق الحراري (${widthMm}×${heightMm} مم)` : `Print Label (${widthMm}x${heightMm} mm)`}</span>
      </Button>
    </div>
  );
}
