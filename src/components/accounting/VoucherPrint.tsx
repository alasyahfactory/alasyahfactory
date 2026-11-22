import { printDocumentHtml, saveDocumentPdfFromHtml, shareDocumentWhatsApp } from "@/utils/printAndPdf";
import React, { useRef } from "react";
import { Printer, FileDown, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Voucher, FactorySettings } from "@/types/database";

interface VoucherPrintProps {
  voucher: Voucher;
  settings: FactorySettings | null;
  compact?: boolean;
}

export const VoucherPrint: React.FC<VoucherPrintProps> = ({ voucher, settings, compact = false }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const isReceipt = voucher.voucher_type === "receipt";
  const isPayment = voucher.voucher_type === "payment";
  const voucherTypeName = isReceipt ? "سند قبض" : isPayment ? "سند صرف" : "سند تحويل";

  
  const getDocumentHtml = (contentHtml: string, docTitle: string = "document") => {
    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <title>${docTitle}</title>
          <meta charset="utf-8" />
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm;
            }
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 0;
              background: #fff;
              font-size: 13px;
              line-height: 1.5;
            }
            .voucher-container {
              border: 2px solid #0f172a;
              border-radius: 6px;
              padding: 24px;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 16px;
              margin-bottom: 20px;
            }
            .header-info-ar {
              text-align: right;
              width: 35%;
            }
            .header-center {
              text-align: center;
              width: 30%;
            }
            .header-info-en {
              text-align: left;
              width: 35%;
              direction: ltr;
            }
            .title-box {
              display: inline-block;
              border: 2px solid #0f172a;
              background-color: #f8fafc;
              padding: 6px 18px;
              border-radius: 4px;
              font-size: 16px;
              font-weight: 800;
              margin-bottom: 6px;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
              background-color: #f8fafc;
              border: 1px solid #cbd5e1;
              padding: 12px;
              border-radius: 6px;
              margin-bottom: 20px;
            }
            .meta-item {
              display: flex;
              justify-content: space-between;
            }
            .meta-label {
              font-weight: 700;
              color: #475569;
            }
            .meta-value {
              font-family: monospace;
              font-weight: 700;
            }
            .amount-box {
              background: #f1f5f9;
              border: 1px dashed #64748b;
              border-radius: 6px;
              padding: 12px 16px;
              margin-bottom: 20px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .amount-val {
              font-size: 20px;
              font-weight: 900;
              font-family: monospace;
              color: #0f172a;
            }
            .desc-box {
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 12px;
              margin-bottom: 30px;
              min-height: 50px;
              background: #fff;
            }
            .signatures {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 20px;
              margin-top: 30px;
              text-align: center;
            }
            .sig-title {
              font-weight: bold;
              margin-bottom: 40px;
              color: #334155;
            }
            .sig-line {
              border-top: 1px dashed #94a3b8;
              margin: 0 10px;
            }
          </style>
        </head>
        <body>
          <div class="voucher-container">
            ${contentHtml}
          </div>
          
        </body>
      </html>
    `;
  };

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    printDocumentHtml(getDocumentHtml(el.innerHTML, "document"), typeof voucherTypeName !== 'undefined' ? voucherTypeName : "document");
  };

  const handleSavePdf = () => {
    const el = printRef.current;
    if (!el) return;
    saveDocumentPdfFromHtml(getDocumentHtml(el.innerHTML, "document"), typeof voucherTypeName !== 'undefined' ? voucherTypeName : "document");
  };

  const handleShareWhatsApp = () => {
    const factory = settings?.name_ar || "مصنع الأسياح للمنتجات الكيميائية";
    const msg = `*${voucherTypeName}*
رقم السند: ${voucher.voucher_number}
التاريخ: ${voucher.voucher_date}
${isReceipt ? "المستلم منه:" : "المصروف له:"} ${voucher.customer?.name_ar || voucher.supplier?.name_ar || voucher.description || "-"}
المبلغ الإجمالي: ${voucher.total_amount.toFixed(2)} ريال سعودي
البيان: ${voucher.description || "-"}
طريقة الدفع: ${voucher.payment_method === "cash" ? "نقداً" : voucher.payment_method === "bank_transfer" ? "تحويل بنكي" : voucher.payment_method === "check" ? "شيك" : "شبكة / نقاط بيع"}
_صادر من ${factory}_`;

    const encoded = encodeURIComponent(msg);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(waUrl, "_blank");
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {/* 1. Print A4 Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrint}
          className={compact ? "h-7 px-2 text-xs gap-1 border-slate-300 text-slate-800 hover:bg-slate-100" : "h-8 px-2.5 gap-1.5 text-xs font-medium text-slate-800 border-slate-300 hover:bg-slate-100"}
          title="طباعة السند A4"
        >
          <Printer className="h-3.5 w-3.5 text-slate-600" />
          <span>{compact ? "طباعة" : "طباعة A4"}</span>
        </Button>

        {/* 2. Save PDF Button */}
        <Button
          variant="tonal"
          size="sm"
          onClick={handleSavePdf}
          className={compact ? "h-7 px-2 text-xs gap-1 font-semibold" : "h-8 px-2.5 gap-1.5 text-xs font-semibold"}
          title="حفظ السند كملف PDF"
        >
          <FileDown className="h-3.5 w-3.5 text-sky-700" />
          <span>{compact ? "PDF" : "حفظ PDF"}</span>
        </Button>

        {/* 3. Share WhatsApp Button */}
        <Button
          variant="emerald"
          size="sm"
          onClick={handleShareWhatsApp}
          className={compact ? "h-7 px-2 text-xs gap-1" : "h-8 px-2.5 gap-1.5 text-xs"}
          title="مشاركة السند عبر واتساب"
        >
          <Share2 className="h-3.5 w-3.5 text-emerald-100" />
          <span>واتساب</span>
        </Button>
      </div>

      {/* Hidden print container */}
      <div style={{ display: "none" }}>
        <div ref={printRef}>
          {/* Header */}
          <div className="header">
            <div className="header-info-ar">
              <div style={{ fontSize: "16px", fontWeight: "bold" }}>
                {settings?.name_ar || "مصنع الأسياح للمنظفات الصناعية"}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>
                سجل تجاري: {settings?.cr_number || "1010000000"}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>
                الرقم الضريبي: {settings?.vat_number || "300000000000003"}
              </div>
            </div>

            <div className="header-center">
              <div className="title-box">
                {voucherTypeName}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "bold" }}>
                {isReceipt ? "RECEIPT VOUCHER" : isPayment ? "PAYMENT VOUCHER" : "TRANSFER VOUCHER"}
              </div>
            </div>

            <div className="header-info-en">
              <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                {settings?.name_en || "Al-Asyah Detergents Factory"}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>
                CR: {settings?.cr_number || "1010000000"}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>
                VAT: {settings?.vat_number || "300000000000003"}
              </div>
            </div>
          </div>

          {/* Meta Details Grid */}
          <div className="meta-grid">
            <div className="meta-item">
              <span className="meta-label">رقم السند / Voucher No:</span>
              <span className="meta-value">{voucher.voucher_number}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">التاريخ / Date:</span>
              <span className="meta-value">{voucher.voucher_date}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">{isReceipt ? "استلمنا من السيد / Payer:" : "يُصرف إلى السيد / Payee:"}</span>
              <span className="meta-value" style={{ fontFamily: "inherit" }}>
                {voucher.customer?.name_ar || voucher.supplier?.name_ar || voucher.description || "غير محدد"}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">طريقة السداد / Payment Method:</span>
              <span className="meta-value" style={{ fontFamily: "inherit" }}>
                {voucher.payment_method === "cash" && "نقداً (صندوق الكاش)"}
                {voucher.payment_method === "bank_transfer" && "تحويل بنكي"}
                {voucher.payment_method === "check" && "شيك مصرفي"}
                {voucher.payment_method === "pos" && "نقاط بيع / شبكة"}
              </span>
            </div>
            {voucher.vehicle && (
              <div className="meta-item">
                <span className="meta-label">سيارة التوزيع المربوطة / Vehicle:</span>
                <span className="meta-value">{voucher.vehicle.name} ({voucher.vehicle.plate_number})</span>
              </div>
            )}
            {voucher.journal_entry_id && (
              <div className="meta-item">
                <span className="meta-label">رقم القيد الآلي / JV Ref:</span>
                <span className="meta-value">JV مرحل بالنظام</span>
              </div>
            )}
          </div>

          {/* Amount Box */}
          <div className="amount-box">
            <div>
              <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>
                {isReceipt ? "المبلغ المقبوض كتابةً" : "المبلغ المصروف كتابةً"}
              </div>
              <div style={{ fontSize: "14px", fontWeight: "bold", marginTop: "2px" }}>
                فقط {voucher.total_amount.toFixed(2)} ريال سعودي لا غير
              </div>
            </div>
            <div className="amount-val">
              {voucher.total_amount.toFixed(2)} SAR
            </div>
          </div>

          {/* VAT breakdown if tax applies */}
          {voucher.tax_amount > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "20px", marginBottom: "16px", fontSize: "12px", color: "#475569" }}>
              <div>المبلغ قبل الضريبة: <strong style={{ color: "#0f172a" }}>{voucher.amount.toFixed(2)} ر.س</strong></div>
              <div>ضريبة القيمة المضافة ({voucher.tax_rate}%): <strong style={{ color: "#0f172a" }}>{voucher.tax_amount.toFixed(2)} ر.س</strong></div>
            </div>
          )}

          {/* Description */}
          <div className="desc-box">
            <div style={{ fontSize: "11px", fontWeight: "bold", color: "#64748b", marginBottom: "4px" }}>
              البيان والشرح / Particulars:
            </div>
            <div style={{ fontSize: "13px", fontWeight: "500" }}>
              {voucher.description}
            </div>
          </div>

          {/* Signatures */}
          <div className="signatures">
            <div>
              <div className="sig-title">{isReceipt ? "المُسلّم / Payer" : "المُستلم / Recipient"}</div>
              <div className="sig-line"></div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "6px" }}>الاسم والتوقيع</div>
            </div>
            <div>
              <div className="sig-title">المحاسب المسؤول / Accountant</div>
              <div className="sig-line"></div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "6px" }}>الاعتماد والتدقيق</div>
            </div>
            <div>
              <div className="sig-title">المدير العام / General Manager</div>
              <div className="sig-line"></div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "6px" }}>المصادقة والختم</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
