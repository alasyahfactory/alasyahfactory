import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import type { Customer, FactorySettings } from "@/types/database";

interface CommercialGuaranteePrintProps {
  customer: Customer;
  settings: FactorySettings | null;
}

export function CommercialGuaranteePrint({ customer, settings }: CommercialGuaranteePrintProps) {
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
          <title>شهادة الضمان التجاري - ${customer.name_ar}</title>
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
            .cert-box {
              border: 3px double #0284c7;
              border-radius: 8px;
              padding: 24px;
              background: #f8fafc;
              margin-bottom: 24px;
            }
            .cert-title {
              text-align: center;
              font-size: 20px;
              font-weight: 900;
              color: #0f172a;
              margin-bottom: 16px;
              letter-spacing: 0.5px;
            }
            .tabular {
              font-family: monospace;
              font-variant-numeric: tabular-nums;
            }
            .statement {
              font-size: 14px;
              text-align: justify;
              margin-bottom: 20px;
              line-height: 1.8;
            }
            .signatures {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 32px;
              margin-top: 50px;
              padding-top: 20px;
            }
            .sig-box {
              text-align: center;
              border-top: 1px solid #94a3b8;
              padding-top: 8px;
            }
            .stamp-box {
              width: 110px;
              height: 110px;
              border: 2px dashed #94a3b8;
              border-radius: 50%;
              margin: 0 auto 12px auto;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #94a3b8;
              font-size: 11px;
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
        className="text-xs border-sky-300 text-sky-700 hover:bg-sky-50 min-h-[36px]"
      >
        <ShieldCheck className="me-1.5 h-4 w-4 text-sky-600" />
        <span>{isAr ? "شهادة الضمان التجاري A4" : "Commercial Guarantee A4"}</span>
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
                س.ت: {settings?.cr_number || "1010000000"} | ترخيص صناعي معتمد
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
                VAT: <span className="tabular">{settings?.vat_number || "300000000000003"}</span>
              </div>
            </div>
          </div>

          {/* Certificate Container */}
          <div className="cert-box">
            <div className="cert-title">
              شهادة ضمان الجودة والمطابقة التجارية
            </div>

            <div className="statement">
              تشهد إدارة <strong>{settings?.name_ar || "مصنع الأسياح للمنظفات الصناعية"}</strong> بأن جميع منتجات المنظفات والمعقمات الموردة إلى السادة / <strong>{customer.name_ar}</strong> (سجل تجاري / ضريبي: <span className="tabular">{customer.vat_number || customer.cr_number || "معتمد"}</span>) مصنعة وفق أعلى المعايير والمواصفات القياسية السعودية (SASO).
            </div>

            <div className="statement" style={{ background: "#fff", padding: "16px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
              <strong>بنود الضمان والتعهد التجاري:</strong>
              <p style={{ marginTop: "8px", color: "#334155" }}>
                {customer.guarantee_text || "نضمن خلو كافة منتجات المنظفات الموردة من الشوائب والترسبات والتغير في اللون أو الرائحة أو اللزوجة طوال فترة الصلاحية المحددة على العبوات (24 شهراً من تاريخ الإنتاج)، مع التعهد الكامل باستبدال أو تعويض قيمة أي عبوة معيبة فوراً دون أي تكلفة على العميل."}
              </p>
            </div>

            <div className="statement" style={{ marginTop: "16px" }}>
              صدرت هذه الشهادة بناءً على طلب العميل وموثقة من إدارة الجودة بالمصنع للعمل بموجبها نظاماً.
            </div>

            {/* Signatures */}
            <div className="signatures">
              <div className="sig-box">
                <div style={{ fontWeight: "bold", marginBottom: "40px" }}>مشرف إدارة الجودة والإنتاج</div>
                <div>التوقيع: ............................</div>
              </div>

              <div className="sig-box">
                <div className="stamp-box">ختم المصنع الرسمي</div>
                <div style={{ fontWeight: "bold" }}>المدير العام للمصنع</div>
                <div style={{ fontSize: "11px", color: "#64748b" }}>مصنع الأسياح للمنظفات</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
