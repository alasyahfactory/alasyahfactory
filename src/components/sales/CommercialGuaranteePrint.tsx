import { printDocumentHtml, saveDocumentPdfFromHtml, shareDocumentWhatsApp } from "@/utils/printAndPdf";
import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Printer, FileDown, Share2 } from "lucide-react";
import type { Customer, FactorySettings } from "@/types/database";

interface CommercialGuaranteePrintProps {
  customer: Customer;
  settings: FactorySettings | null;
  compact?: boolean;
}

export function CommercialGuaranteePrint({ customer, settings, compact = false }: CommercialGuaranteePrintProps) {
  const { i18n } = useTranslation();
  const printContainerRef = useRef<HTMLDivElement>(null);
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
            }
            .statement {
              margin-bottom: 16px;
              text-align: justify;
              font-size: 14px;
            }
            .signatures {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 32px;
              margin-top: 48px;
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
          ${contentHtml}
          
        </body>
      </html>
    `;
  };

  const handlePrint = () => {
    const el = printContainerRef.current;
    if (!el) return;
    printDocumentHtml(getDocumentHtml(el.innerHTML, "document"), typeof "ضمان_تجاري" !== 'undefined' ? "ضمان_تجاري" : "document");
  };

  const handleSavePdf = () => {
    const el = printContainerRef.current;
    if (!el) return;
    saveDocumentPdfFromHtml(getDocumentHtml(el.innerHTML, "document"), typeof "ضمان_تجاري" !== 'undefined' ? "ضمان_تجاري" : "document");
  };

  const handleShareWhatsApp = () => {
    const factory = settings?.name_ar || "مصنع الأسياح للمنتجات الكيميائية";
    const guarantee = customer.guarantee_text || "ضمان جودة المنظفات والمعقمات وفق مواصفات الهيئة السعودية للمواصفات والمقاييس والجودة (SASO)";
    const msg = `*شهادة ضمان الجودة والمطابقة التجارية*
السادة/ ${customer.name_ar}
نحيطكم علماً بصدور شهادة الضمان التجاري المعتمدة لمنتجاتكم الموردة من ${factory}.
*البنود:* ${guarantee}
صلاحية المنتجات 24 شهراً مع الالتزام التام بالاستبدال والتعويض الفوري.
_صادرة ومعتمدة من إدارة الجودة بالمصنع_`;

    const encoded = encodeURIComponent(msg);
    const phone = customer.phone?.replace(/[^0-9]/g, "") || "";
    const waUrl = phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(waUrl, "_blank");
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {/* 1. Print A4 Button */}
        <Button
          onClick={handlePrint}
          size="sm"
          variant="outline"
          className={compact ? "h-7 px-2 text-xs gap-1 border-sky-300 text-sky-800 hover:bg-sky-50" : "text-xs border-sky-300 text-sky-800 hover:bg-sky-50 min-h-[36px] gap-1.5"}
          title={isAr ? "طباعة شهادة الضمان A4" : "Print Guarantee A4"}
        >
          <Printer className="h-3.5 w-3.5 text-sky-600" />
          <span>{compact ? (isAr ? "طباعة" : "Print") : (isAr ? "طباعة A4" : "Print A4")}</span>
        </Button>

        {/* 2. Save PDF Button */}
        <Button
          onClick={handleSavePdf}
          size="sm"
          variant="tonal"
          className={compact ? "h-7 px-2 text-xs gap-1 font-semibold" : "text-xs min-h-[36px] px-2.5 gap-1.5 font-semibold"}
          title={isAr ? "حفظ كملف PDF" : "Save as PDF"}
        >
          <FileDown className="h-3.5 w-3.5 text-sky-700" />
          <span>{compact ? "PDF" : (isAr ? "حفظ PDF" : "Save PDF")}</span>
        </Button>

        {/* 3. Share WhatsApp Button */}
        <Button
          onClick={handleShareWhatsApp}
          size="sm"
          variant="emerald"
          className={compact ? "h-7 px-2 text-xs gap-1" : "text-xs min-h-[36px] px-2.5 gap-1.5"}
          title={isAr ? "مشاركة الضمان عبر واتساب" : "Share via WhatsApp"}
        >
          <Share2 className="h-3.5 w-3.5 text-emerald-100" />
          <span>{isAr ? "واتساب" : "WhatsApp"}</span>
        </Button>
      </div>

      <div style={{ display: "none" }}>
        <div ref={printContainerRef}>
          {/* Header */}
          <div className="header-grid">
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: "bold", fontSize: "15px" }}>
                {settings?.name_ar || "مصنع الأسياح للمنظفات الصناعية"}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>
                س.ت: {settings?.cr_number || "1010000000"} | الرقم الضريبي: {settings?.vat_number || "300000000000003"}
              </div>
            </div>

            <div style={{ textAlign: "center" }}>
              {settings?.logo_base64 ? (
                <img src={settings.logo_base64} alt="Logo" className="logo-img" />
              ) : (
                <div style={{ fontWeight: "bold", fontSize: "18px", letterSpacing: "1px" }}>AL-ASYAH</div>
              )}
            </div>

            <div style={{ textAlign: "left", direction: "ltr" }}>
              <div style={{ fontWeight: "bold", fontSize: "13px" }}>
                {settings?.name_en || "Al-Asyah Chemical Detergent Factory"}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>Quality Assurance Dept.</div>
            </div>
          </div>

          {/* Certificate Content */}
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
