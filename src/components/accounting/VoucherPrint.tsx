import React, { useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Voucher, FactorySettings } from "@/types/database";

interface VoucherPrintProps {
  voucher: Voucher;
  settings: FactorySettings | null;
}

export const VoucherPrint: React.FC<VoucherPrintProps> = ({ voucher, settings }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const isReceipt = voucher.voucher_type === "receipt";
  const isPayment = voucher.voucher_type === "payment";

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <title>${voucher.voucher_number} - ${isReceipt ? "سند قبض" : isPayment ? "سند صرف" : "سند تحويل"}</title>
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
              color: #0f172a;
            }
            .amount-box {
              border: 2px solid #0f172a;
              border-radius: 6px;
              padding: 16px;
              background-color: #f1f5f9;
              margin-bottom: 20px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .amount-val {
              font-size: 20px;
              font-weight: 900;
              color: #0f172a;
              font-family: monospace;
            }
            .desc-box {
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 14px;
              margin-bottom: 30px;
              background: #fff;
              min-height: 60px;
            }
            .signatures {
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 20px;
              text-align: center;
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px dashed #cbd5e1;
            }
            .sig-title {
              font-weight: 700;
              margin-bottom: 50px;
            }
            .sig-line {
              border-top: 1px solid #64748b;
              margin: 0 20px;
            }
          </style>
        </head>
        <body>
          <div class="voucher-container">
            ${printContent.innerHTML}
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePrint}
        className="h-8 gap-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
      >
        <Printer className="h-3.5 w-3.5" />
        <span>طباعة السند</span>
      </Button>

      {/* Hidden print container */}
      <div style={{ display: "none" }}>
        <div ref={printRef}>
          {/* Header */}
          <div className="header">
            <div className="header-info-ar">
              <div style={{ fontSize: "16px", fontWeight: "bold" }}>
                {settings?.name_ar || "مصنع الآسية للمنظفات الصناعية"}
              </div>
              <div>س.ت: {settings?.cr_number || "1131012345"}</div>
              <div>الرقم الضريبي: {settings?.vat_number || "300000000000003"}</div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>{settings?.national_address}</div>
            </div>

            <div className="header-center">
              <div className="title-box">
                {isReceipt ? "سند قبض مالي" : isPayment ? "سند صرف مالي" : "سند تحويل داخلي"}
              </div>
              <div style={{ fontSize: "11px", color: "#475569", fontWeight: "bold" }}>
                {isReceipt ? "RECEIPT VOUCHER" : isPayment ? "PAYMENT VOUCHER" : "TRANSFER VOUCHER"}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: "14px", fontWeight: "bold", marginTop: "4px" }}>
                {voucher.voucher_number}
              </div>
            </div>

            <div className="header-info-en">
              <div style={{ fontSize: "15px", fontWeight: "bold" }}>
                {settings?.name_en || "Al-Asyah Detergent Factory"}
              </div>
              <div>CR: {settings?.cr_number || "1131012345"}</div>
              <div>VAT: {settings?.vat_number || "300000000000003"}</div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>Kingdom of Saudi Arabia</div>
            </div>
          </div>

          {/* Meta Grid */}
          <div className="meta-grid">
            <div className="meta-item">
              <span className="meta-label">التاريخ / Date:</span>
              <span className="meta-value">{voucher.voucher_date}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">طريقة الدفع / Payment Method:</span>
              <span className="meta-value">
                {voucher.payment_method === "cash"
                  ? "نقداً / Cash"
                  : voucher.payment_method === "bank_transfer"
                  ? "تحويل بنكي / Bank Transfer"
                  : voucher.payment_method === "check"
                  ? "شيك مصرفي / Check"
                  : voucher.payment_method === "pos"
                  ? "مدى / POS"
                  : "عربون مقدم / Advance"}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">{isReceipt ? "استلمنا من السيد / Received From:" : "يُصرف إلى السيد / Paid To:"}</span>
              <span className="meta-value">
                {voucher.customer?.name_ar || voucher.supplier?.name_ar || voucher.sales_rep?.full_name || voucher.contra_account?.name_ar || "الجهة المذكورة"}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">الحساب المالي / Account:</span>
              <span className="meta-value">
                {voucher.account?.code} - {voucher.account?.name_ar}
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
