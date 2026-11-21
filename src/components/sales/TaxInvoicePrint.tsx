import React, { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import type { SalesInvoice, FactorySettings } from "@/types/database";

interface TaxInvoicePrintProps {
  invoice: SalesInvoice;
  settings: FactorySettings | null;
  isCreditNote?: boolean;
}

export function TaxInvoicePrint({ invoice, settings, isCreditNote = false }: TaxInvoicePrintProps) {
  const { i18n } = useTranslation();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const printContainerRef = useRef<HTMLDivElement>(null);
  const isAr = i18n.language === "ar";

  useEffect(() => {
    if (invoice.zatca_qr_base64) {
      QRCode.toDataURL(invoice.zatca_qr_base64, {
        width: 140,
        margin: 1,
        errorCorrectionLevel: "M",
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error("QR Code Error:", err));
    }
  }, [invoice.zatca_qr_base64]);

  const handlePrint = () => {
    const content = printContainerRef.current;
    if (!content) return;

    const win = window.open("", "_blank");
    if (!win) return;

    win.document.write(`
      <!DOCTYPE html>
      <html dir="${isAr ? "rtl" : "ltr"}">
        <head>
          <title>${isCreditNote ? "إشعار دائن ضريبي" : "فاتورة ضريبية"} - ${invoice.invoice_number}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "IBM Plex Sans Arabic", sans-serif;
              color: #0f172a;
              background: #fff;
              margin: 0;
              padding: 0;
              font-size: 12px;
              line-height: 1.4;
            }
            .watermark {
              position: fixed;
              top: 45%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-35deg);
              font-size: 80px;
              font-weight: 900;
              color: rgba(226, 232, 240, 0.5);
              text-transform: uppercase;
              z-index: -1;
              pointer-events: none;
              letter-spacing: 4px;
            }
            .header-grid {
              display: grid;
              grid-template-columns: 1fr auto 1fr;
              gap: 16px;
              align-items: center;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 12px;
              margin-bottom: 16px;
            }
            .logo-img {
              max-height: 65px;
              max-width: 140px;
              object-fit: contain;
            }
            .doc-title-bar {
              background: #0f172a;
              color: #fff;
              text-align: center;
              padding: 6px;
              font-weight: bold;
              font-size: 14px;
              margin-bottom: 14px;
              border-radius: 4px;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
              margin-bottom: 16px;
            }
            .info-box {
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 10px;
              background: #f8fafc;
            }
            .info-box h4 {
              margin: 0 0 6px 0;
              font-size: 11px;
              color: #475569;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 4px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 4px;
              font-size: 11.5px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 16px;
            }
            th {
              background: #f1f5f9;
              border: 1px solid #cbd5e1;
              padding: 6px 8px;
              font-weight: bold;
              font-size: 11px;
              text-align: inherit;
            }
            td {
              border: 1px solid #e2e8f0;
              padding: 6px 8px;
              font-size: 11px;
            }
            .tabular {
              font-family: monospace;
              font-variant-numeric: tabular-nums;
            }
            .totals-container {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 16px;
              margin-top: 10px;
            }
            .qr-box {
              text-align: center;
              border: 1px solid #cbd5e1;
              padding: 8px;
              border-radius: 6px;
              background: #fff;
            }
            .totals-box {
              width: 260px;
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              overflow: hidden;
            }
            .totals-row {
              display: flex;
              justify-content: space-between;
              padding: 6px 10px;
              font-size: 11.5px;
              border-bottom: 1px solid #e2e8f0;
            }
            .totals-row.grand {
              background: #0f172a;
              color: #fff;
              font-weight: bold;
              font-size: 13px;
              border-bottom: none;
            }
            .footer-note {
              margin-top: 24px;
              padding-top: 8px;
              border-top: 1px dashed #cbd5e1;
              font-size: 10px;
              color: #64748b;
              text-align: center;
            }
          </style>
        </head>
        <body>
          ${content.innerHTML}
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const isDraft = invoice.status === "draft";
  const isCopy = invoice.print_count > 1;

  return (
    <div>
      <Button
        onClick={handlePrint}
        size="sm"
        className="bg-slate-900 hover:bg-slate-800 text-white min-h-[40px] px-4"
      >
        <Printer className="me-2 h-4 w-4 text-sky-400" />
        <span>{isAr ? "طباعة الفاتورة الضريبية A4" : "Print Tax Invoice A4"}</span>
      </Button>

      {/* Hidden Render Template */}
      <div style={{ display: "none" }}>
        <div ref={printContainerRef}>
          {/* Watermark */}
          {isDraft && <div className="watermark">مسودة / DRAFT</div>}
          {!isDraft && isCopy && <div className="watermark">نسخة / COPY</div>}

          {/* Unified A4 Header */}
          <div className="header-grid">
            {/* Arabic Right */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: "bold", fontSize: "14px" }}>
                {settings?.name_ar || "مصنع الأسياح للمنظفات الصناعية"}
              </div>
              <div style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>
                س.ت: {settings?.cr_number || "1010000000"}
              </div>
              <div style={{ fontSize: "10px", color: "#475569" }}>
                {settings?.national_address || "المملكة العربية السعودية - القصيم"}
              </div>
            </div>

            {/* Logo Center */}
            <div style={{ textAlign: "center" }}>
              {settings?.logo_base64 ? (
                <img src={settings.logo_base64} alt="Logo" className="logo-img" />
              ) : (
                <div style={{ fontWeight: "bold", fontSize: "16px", color: "#0284c7" }}>
                  AL-ASYAH ERP
                </div>
              )}
            </div>

            {/* English Left */}
            <div style={{ textAlign: "left" }}>
              <div style={{ fontWeight: "bold", fontSize: "13px" }}>
                {settings?.name_en || "Al-Asyah Detergents Factory"}
              </div>
              <div style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>
                VAT: <span className="tabular">{settings?.vat_number || "300000000000003"}</span>
              </div>
              <div style={{ fontSize: "10px", color: "#475569" }}>
                IBAN: <span className="tabular">{settings?.iban || "SA0000000000000000000000"}</span>
              </div>
            </div>
          </div>

          {/* Document Title Bar */}
          <div className="doc-title-bar">
            {isCreditNote ? "إشعار دائن ضريبي / TAX CREDIT NOTE" : "فاتورة ضريبية / TAX INVOICE"}
          </div>

          {/* Metadata Grid */}
          <div className="meta-grid">
            {/* Invoice Info */}
            <div className="info-box">
              <h4>بيانات الفاتورة / Invoice Details</h4>
              <div className="info-row">
                <span>رقم المستند / Doc No:</span>
                <span className="tabular" style={{ fontWeight: "bold" }}>{invoice.invoice_number}</span>
              </div>
              <div className="info-row">
                <span>تاريخ الفاتورة / Date:</span>
                <span className="tabular">{invoice.invoice_date}</span>
              </div>
              <div className="info-row">
                <span>تاريخ الاستحقاق / Due Date:</span>
                <span className="tabular">{invoice.due_date}</span>
              </div>
              <div className="info-row">
                <span>طريقة التوريد / Source:</span>
                <span>{invoice.source_type === "van_sale" ? "مبيعات سيارة توزيع" : "مستودع المصنع"}</span>
              </div>
            </div>

            {/* Customer Info */}
            <div className="info-box">
              <h4>بيانات العميل / Customer Details</h4>
              <div className="info-row">
                <span>اسم العميل / Name:</span>
                <span style={{ fontWeight: "bold" }}>{invoice.customer?.name_ar || "-"}</span>
              </div>
              <div className="info-row">
                <span>الرقم الضريبي / VAT No:</span>
                <span className="tabular">{invoice.customer?.vat_number || "غير مسجل"}</span>
              </div>
              <div className="info-row">
                <span>الجوال / Phone:</span>
                <span className="tabular">{invoice.customer?.phone || "-"}</span>
              </div>
              <div className="info-row">
                <span>العنوان / Address:</span>
                <span>{invoice.customer?.national_address || "-"}</span>
              </div>
            </div>
          </div>

          {/* Lines Table */}
          <table>
            <thead>
              <tr>
                <th style={{ width: "30px", textAlign: "center" }}>#</th>
                <th>الصنف والوصف / Description</th>
                <th style={{ textAlign: "center", width: "60px" }}>الوحدة</th>
                <th style={{ textAlign: "center", width: "60px" }}>الكمية</th>
                <th style={{ textAlign: "right", width: "80px" }}>سعر الوحدة</th>
                <th style={{ textAlign: "right", width: "85px" }}>المجموع (غير شامل)</th>
                <th style={{ textAlign: "right", width: "65px" }}>الضريبة 15%</th>
                <th style={{ textAlign: "right", width: "95px" }}>الإجمالي شامل</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines?.map((line, idx) => (
                <tr key={line.id || idx}>
                  <td style={{ textAlign: "center" }}>{idx + 1}</td>
                  <td>
                    <span style={{ fontWeight: "bold" }}>{line.item?.name_ar}</span>
                    <span style={{ display: "block", fontSize: "9.5px", color: "#64748b" }}>
                      {line.item?.name_en} ({line.item?.sku})
                    </span>
                    {line.is_bonus_or_sample && (
                      <span style={{ color: "#d97706", fontWeight: "bold", fontSize: "9.5px" }}>
                        [بونص ترويجي مجاني]
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "center" }}>{line.unit_type === "carton" ? "كرتون" : "حبة"}</td>
                  <td style={{ textAlign: "center" }} className="tabular">{line.quantity}</td>
                  <td style={{ textAlign: "right" }} className="tabular">{line.unit_price_ex_vat.toFixed(2)}</td>
                  <td style={{ textAlign: "right" }} className="tabular">{line.total_price_ex_vat.toFixed(2)}</td>
                  <td style={{ textAlign: "right" }} className="tabular">{line.vat_amount.toFixed(2)}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold" }} className="tabular">
                    {line.total_line_inc_vat.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals & ZATCA QR */}
          <div className="totals-container">
            {/* ZATCA QR Code */}
            <div className="qr-box">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="ZATCA Phase 1 QR" style={{ width: "120px", height: "120px" }} />
              ) : (
                <div style={{ width: "120px", height: "120px", background: "#f1f5f9" }} />
              )}
              <div style={{ fontSize: "9px", color: "#64748b", marginTop: "4px" }}>
                رمز الاستجابة السريع ZATCA
              </div>
            </div>

            {/* Financial Summary */}
            <div className="totals-box">
              <div className="totals-row">
                <span>الإجمالي قبل الضريبة:</span>
                <span className="tabular">{invoice.total_amount_ex_vat.toFixed(2)} ر.س</span>
              </div>
              <div className="totals-row">
                <span>ضريبة القيمة المضافة (15%):</span>
                <span className="tabular">{invoice.vat_amount.toFixed(2)} ر.س</span>
              </div>
              <div className="totals-row" style={{ fontWeight: "bold" }}>
                <span>المجموع شامل الضريبة:</span>
                <span className="tabular">{invoice.total_amount_inc_vat.toFixed(2)} ر.س</span>
              </div>
              {invoice.advance_deducted > 0 && (
                <div className="totals-row" style={{ color: "#0284c7" }}>
                  <span>العربون المخصوم (دفعة مقدمة):</span>
                  <span className="tabular">-{invoice.advance_deducted.toFixed(2)} ر.س</span>
                </div>
              )}
              <div className="totals-row grand">
                <span>صافي المستحق للسداد:</span>
                <span className="tabular">{invoice.net_amount_due.toFixed(2)} ر.س</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="footer-note">
            تم إصدار هذه الفاتورة إلكترونياً وهي معتمدة من نظام مصنع الأسياح للمنظفات المتوافق مع هيئة الزكاة والضريبة والجمارك (ZATCA).
          </div>
        </div>
      </div>
    </div>
  );
}
