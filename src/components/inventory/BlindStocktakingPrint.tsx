import React, { useRef } from "react";
import { Printer, EyeOff, FileDown, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StocktakingSession, FactorySettings } from "@/types/database";

interface BlindStocktakingPrintProps {
  session: StocktakingSession;
  settings: FactorySettings | null;
  compact?: boolean;
}

export const BlindStocktakingPrint: React.FC<BlindStocktakingPrintProps> = ({ session, settings, compact = false }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = (isPdf = false) => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const docTitle = isPdf
      ? `ورقة_الجرد_الأعمى_${session.session_number}`
      : `${session.session_number} - ورقة الجرد الأعمى`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <title>${docTitle}</title>
          <meta charset="utf-8" />
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm;
            }
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 0;
              background: #fff;
              font-size: 11px;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 10px;
              margin-bottom: 12px;
            }
            .title-box {
              text-align: center;
            }
            .badge-blind {
              display: inline-block;
              background-color: #f1f5f9;
              border: 1px solid #94a3b8;
              padding: 4px 12px;
              border-radius: 4px;
              font-weight: 800;
              font-size: 13px;
              margin-top: 4px;
            }
            .meta-bar {
              display: flex;
              justify-content: space-between;
              background-color: #f8fafc;
              border: 1px solid #cbd5e1;
              padding: 8px 12px;
              border-radius: 4px;
              margin-bottom: 15px;
              font-size: 11px;
            }
            .stock-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            .stock-table th, .stock-table td {
              border: 1px solid #cbd5e1;
              padding: 6px 8px;
            }
            .stock-table th {
              background-color: #f1f5f9;
              font-weight: 700;
              text-align: center;
            }
            .empty-box {
              height: 24px;
              background-color: #fff;
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
              margin-bottom: 40px;
            }
            .sig-line {
              border-top: 1px solid #64748b;
              margin: 0 30px;
            }
          </style>
        </head>
        <body>
          <div>
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

  const handleShareWhatsApp = () => {
    const factory = settings?.name_ar || "مصنع الأسياح للمنتجات الكيميائية";
    const msg = `*ورقة الجرد المخزني الأعمى (Blind Stocktaking)*
رقم جلسة الجرد: ${session.session_number}
تاريخ الجرد: ${session.session_date}
المستودع: ${session.warehouse?.name_ar || "المستودع الرئيسي"}
عدد الأصناف المطلوب حصرها: ${session.lines?.length || 0} صنف
_صادر من إدارة المستودعات والمخزون - ${factory}_`;

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
          onClick={() => handlePrint(false)}
          className={compact ? "h-7 px-2 text-xs gap-1 border-slate-300 text-slate-800 hover:bg-slate-100" : "h-8 px-2.5 gap-1.5 text-xs font-medium text-slate-800 border-slate-300 hover:bg-slate-100"}
          title="طباعة ورقة الجرد الأعمى A4"
        >
          <Printer className="h-3.5 w-3.5 text-slate-600" />
          <EyeOff className="h-3.5 w-3.5 text-amber-600" />
          <span>{compact ? "طباعة" : "طباعة ورقة الجرد الأعمى A4"}</span>
        </Button>

        {/* 2. Save PDF Button */}
        <Button
          variant="tonal"
          size="sm"
          onClick={() => handlePrint(true)}
          className={compact ? "h-7 px-2 text-xs gap-1 font-semibold" : "h-8 px-2.5 gap-1.5 text-xs font-semibold"}
          title="حفظ ورقة الجرد كملف PDF"
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
          title="مشاركة تفاصيل الجرد عبر واتساب"
        >
          <Share2 className="h-3.5 w-3.5 text-emerald-100" />
          <span>واتساب</span>
        </Button>
      </div>

      {/* Hidden print template */}
      <div style={{ display: "none" }}>
        <div ref={printRef}>
          {/* Header */}
          <div className="header">
            <div>
              <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                {settings?.name_ar || "مصنع الآسية للمنظفات الصناعية"}
              </div>
              <div>سجل تجاري: {settings?.cr_number || "1131012345"}</div>
            </div>

            <div className="title-box">
              <div style={{ fontSize: "16px", fontWeight: "bold" }}>
                نموذج العد والحصر الفعلي (جرد أعمى)
              </div>
              <div className="badge-blind">
                BLIND STOCKTAKING SHEET
              </div>
            </div>

            <div style={{ textAlign: "left", direction: "ltr" }}>
              <div style={{ fontSize: "13px", fontWeight: "bold" }}>
                {settings?.name_en || "Al-Asyah Detergent Factory"}
              </div>
              <div>Date: {session.session_date}</div>
            </div>
          </div>

          {/* Meta Bar */}
          <div className="meta-bar">
            <div>
              <strong>رقم جلسة الجرد:</strong> {session.session_number}
            </div>
            <div>
              <strong>المستودع المستهدف:</strong> {session.warehouse?.name_ar || "المستودع الرئيسي"}
            </div>
            <div>
              <strong>المسؤول عن الجرد:</strong> {session.created_by || "فريق الجرد الميداني"}
            </div>
            <div>
              <strong>تاريخ البدء:</strong> {session.session_date}
            </div>
          </div>

          <div style={{ padding: "6px 8px", backgroundColor: "#fffbeb", border: "1px dashed #f59e0b", borderRadius: "4px", marginBottom: "12px", fontSize: "10px", color: "#b45309" }}>
            * تنبيه رقابي: تم إخفاء الكميات الدفترية المسجلة بالنظام لضمان دقة ونزاهة الحصر الفعلي بالمستودع وفق معايير الحوكمة.
          </div>

          {/* Table */}
          <table className="stock-table">
            <thead>
              <tr>
                <th style={{ width: "35px" }}>#</th>
                <th style={{ width: "100px" }}>رمز الصنف SKU</th>
                <th>اسم الصنف / المادة المخزنية</th>
                <th style={{ width: "80px" }}>وحدة القياس</th>
                <th style={{ width: "100px" }}>الكمية الفعلية المحصورة</th>
                <th style={{ width: "140px" }}>ملاحظات الجرد / رقم الباتش</th>
              </tr>
            </thead>
            <tbody>
              {session.lines?.map((line, idx) => (
                <tr key={line.id || idx}>
                  <td style={{ textAlign: "center" }}>{idx + 1}</td>
                  <td style={{ fontFamily: "monospace", textAlign: "center" }}>{line.item?.sku || "-"}</td>
                  <td style={{ fontWeight: "600" }}>{line.item?.name_ar || "صنف مخزني"}</td>
                  <td style={{ textAlign: "center" }}>{line.item?.base_unit === "gram" ? "جرام" : "حبة / كرتون"}</td>
                  <td className="empty-box" style={{ border: "1.5px solid #0f172a" }}></td>
                  <td className="empty-box"></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Signatures */}
          <div className="signatures">
            <div>
              <div className="sig-title">عضو لجنة الجرد 1</div>
              <div className="sig-line"></div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>الاسم والتوقيع</div>
            </div>
            <div>
              <div className="sig-title">عضو لجنة الجرد 2</div>
              <div className="sig-line"></div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>الاسم والتوقيع</div>
            </div>
            <div>
              <div className="sig-title">أمين المستودع (شاهد)</div>
              <div className="sig-line"></div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>الاسم والتوقيع</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
