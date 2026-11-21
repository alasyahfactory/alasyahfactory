import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import type { Customer, FactorySettings } from "@/types/database";

interface BalanceConfirmationPrintProps {
  customer: Customer;
  currentBalance: number;
  asOfDate?: string;
  settings: FactorySettings | null;
}

export function BalanceConfirmationPrint({
  customer,
  currentBalance,
  asOfDate = new Date().toISOString().split("T")[0],
  settings,
}: BalanceConfirmationPrintProps) {
  const { i18n } = useTranslation();
  const printContainerRef = useRef<HTMLDivElement>(null);
  const isAr = i18n.language === "ar";

  const handlePrint = () => {
    const content = printContainerRef.current;
    if (!content) return;

    const win = window.open("", "_blank");
    if (!win) return;

    win.document.write(`
      <!DOCTYPE html>
      <html dir="${isAr ? "rtl" : "ltr"}">
        <head>
          <title>خطاب مصادقة الرصيد - ${customer.name_ar}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "IBM Plex Sans Arabic", sans-serif;
              color: #0f172a;
              background: #fff;
              margin: 0;
              padding: 0;
              font-size: 13px;
              line-height: 1.6;
            }
            .header-grid {
              display: grid;
              grid-template-columns: 1fr auto 1fr;
              gap: 16px;
              align-items: center;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 12px;
              margin-bottom: 24px;
            }
            .logo-img {
              max-height: 70px;
              max-width: 150px;
              object-fit: contain;
            }
            .letter-box {
              padding: 10px;
            }
            .title-bar {
              text-align: center;
              font-size: 18px;
              font-weight: bold;
              color: #0f172a;
              margin-bottom: 24px;
              text-decoration: underline;
            }
            .tabular {
              font-family: monospace;
              font-variant-numeric: tabular-nums;
            }
            .balance-card {
              border: 2px solid #cbd5e1;
              background: #f8fafc;
              border-radius: 8px;
              padding: 16px;
              text-align: center;
              margin: 20px 0;
            }
            .reply-section {
              margin-top: 40px;
              border: 1px dashed #94a3b8;
              border-radius: 6px;
              padding: 16px;
              background: #fff;
            }
            .signatures {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 32px;
              margin-top: 35px;
            }
            .sig-box {
              text-align: center;
              border-top: 1px solid #cbd5e1;
              padding-top: 6px;
              font-size: 12px;
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

  return (
    <div>
      <Button
        onClick={handlePrint}
        size="sm"
        variant="outline"
        className="text-xs border-slate-300 text-slate-700 hover:bg-slate-50 min-h-[36px]"
      >
        <FileText className="me-1.5 h-4 w-4 text-slate-500" />
        <span>{isAr ? "خطاب مصادقة الرصيد A4" : "Balance Confirmation A4"}</span>
      </Button>

      <div style={{ display: "none" }}>
        <div ref={printContainerRef}>
          {/* Header */}
          <div className="header-grid">
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: "bold", fontSize: "15px" }}>
                {settings?.name_ar || "مصنع الأسياح للمنظفات الصناعية"}
              </div>
              <div style={{ fontSize: "11px", color: "#475569" }}>
                الإدارة المالية والحسابات العامة
              </div>
            </div>

            <div style={{ textAlign: "center" }}>
              {settings?.logo_base64 ? (
                <img src={settings.logo_base64} alt="Logo" className="logo-img" />
              ) : (
                <div style={{ fontWeight: "bold", fontSize: "18px", color: "#0284c7" }}>
                  AL-ASYAH ERP
                </div>
              )}
            </div>

            <div style={{ textAlign: "left" }}>
              <div style={{ fontWeight: "bold", fontSize: "14px" }}>
                {settings?.name_en || "Al-Asyah Detergents Factory"}
              </div>
              <div style={{ fontSize: "11px", color: "#475569" }}>
                Financial & Auditing Department
              </div>
            </div>
          </div>

          <div className="letter-box">
            <div className="title-bar">
              خطاب مصادقة وتأكيد رصيد حساب (Balance Confirmation Letter)
            </div>

            <div style={{ marginBottom: "16px" }}>
              <div><strong>التاريخ:</strong> <span className="tabular">{asOfDate}</span></div>
              <div style={{ marginTop: "4px" }}>
                <strong>السادة المحترمون / </strong> {customer.name_ar}
              </div>
              <div><strong>الرقم الضريبي / السجل:</strong> <span className="tabular">{customer.vat_number || customer.cr_number || "-"}</span></div>
              <div><strong>العنوان:</strong> {customer.national_address || "المملكة العربية السعودية"}</div>
            </div>

            <p style={{ textAlign: "justify", lineHeight: 1.8 }}>
              السلام عليكم ورحمة الله وبركاته،<br />
              في إطار المراجعة الدورية لحساباتنا ومطابقة الأرصدة المدينة والدائنة، نرجو من سعادتكم التكرم بمراجعة رصيد حسابكم المسجل في دفاترنا المحاسبية كما في تاريخ <span className="tabular"><strong>{asOfDate}</strong></span>، والموضح تفاصيله أدناه:
            </p>

            <div className="balance-card">
              <span style={{ fontSize: "13px", color: "#64748b" }}>الرصيد المستحق بذمتكم لصالح المصنع:</span>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#0f172a", marginTop: "4px" }}>
                <span className="tabular">{currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> ريال سعودي
              </div>
            </div>

            <div className="signatures">
              <div className="sig-box">
                <div style={{ fontWeight: "bold" }}>إعداد / قسم الحسابات العامة</div>
                <div style={{ marginTop: "24px" }}>التوقيع: ............................</div>
              </div>
              <div className="sig-box">
                <div style={{ fontWeight: "bold" }}>اعتماد / المدير المالي</div>
                <div style={{ marginTop: "24px" }}>الختم والتوقيع: ............................</div>
              </div>
            </div>

            {/* Customer Reply Coupon */}
            <div className="reply-section">
              <div style={{ fontWeight: "bold", fontSize: "12px", borderBottom: "1px dashed #cbd5e1", paddingBottom: "6px", marginBottom: "8px" }}>
                رد وتأكيد العميل (يرجى التوقيع وإعادة إرسال النسخة):
              </div>
              <div style={{ fontSize: "12px", lineHeight: "1.8" }}>
                [ ] نؤكد صحة ومطابقة الرصيد المذكور أعلاه وقدره (................... ر.س).<br />
                [ ] الرصيد المذكور غير مطابق، والفارق قدره (................... ر.س) للأسباب الآتية: .......................................<br />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "16px", fontSize: "12px" }}>
                <span>اسم المسؤول المفوض: .................................</span>
                <span>التوقيع والختم: .................................</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
