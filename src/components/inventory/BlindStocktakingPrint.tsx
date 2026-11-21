import React, { useRef } from "react";
import { Printer, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StocktakingSession, FactorySettings } from "@/types/database";

interface BlindStocktakingPrintProps {
  session: StocktakingSession;
  settings: FactorySettings | null;
}

export const BlindStocktakingPrint: React.FC<BlindStocktakingPrintProps> = ({ session, settings }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <title>${session.session_number} - ورقة الجرد الأعمى</title>
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

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePrint}
        className="h-8 gap-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
      >
        <EyeOff className="h-3.5 w-3.5 text-slate-500" />
        <span>ورقة الجرد الأعمى (A4)</span>
      </Button>

      {/* Hidden print container */}
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
              <div className="badge-blind">
                ورقة الجرد الفعلي الأعمى (Blind Stocktaking Sheet)
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                الكميات الدفترية محجوبة منعاً للتحيز في العد
              </div>
            </div>

            <div style={{ textAlign: "left", direction: "ltr" }}>
              <div style={{ fontSize: "13px", fontWeight: "bold" }}>
                {settings?.name_en || "Al-Asyah Detergent Factory"}
              </div>
              <div style={{ fontFamily: "monospace" }}>Session: {session.session_number}</div>
            </div>
          </div>

          {/* Meta Bar */}
          <div className="meta-bar">
            <div>المستودع المستهدف: <strong>{session.warehouse?.name_ar || "المستودع الرئيسي"}</strong></div>
            <div>تاريخ الجرد: <strong>{session.session_date}</strong></div>
            <div>رقم الجلسة: <strong style={{ fontFamily: "monospace" }}>{session.session_number}</strong></div>
          </div>

          {/* Table */}
          <table className="stock-table">
            <thead>
              <tr>
                <th style={{ width: "35px" }}>#</th>
                <th style={{ width: "120px" }}>كود الصنف (SKU)</th>
                <th>اسم الصنف / الخامة</th>
                <th style={{ width: "70px" }}>وحدة القياس</th>
                <th style={{ width: "100px" }}>العد الفعلي الأول</th>
                <th style={{ width: "100px" }}>العد الفعلي الثاني (المطابقة)</th>
                <th style={{ width: "130px" }}>ملاحظات الجرد الميداني</th>
              </tr>
            </thead>
            <tbody>
              {session.lines?.map((line, idx) => (
                <tr key={line.id || idx}>
                  <td style={{ textAlign: "center", fontWeight: "bold" }}>{idx + 1}</td>
                  <td style={{ fontFamily: "monospace", fontWeight: "bold" }}>{line.item?.sku}</td>
                  <td style={{ fontWeight: "bold" }}>{line.item?.name_ar}</td>
                  <td style={{ textAlign: "center" }}>{line.item?.base_unit === "gram" ? "جرام / كجم" : "حبة"}</td>
                  <td className="empty-box"></td>
                  <td className="empty-box"></td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Signatures */}
          <div className="signatures">
            <div>
              <div className="sig-title">عضو لجنة الجرد (1)</div>
              <div className="sig-line"></div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>الاسم والتوقيع</div>
            </div>
            <div>
              <div className="sig-title">عضو لجنة الجرد (2)</div>
              <div className="sig-line"></div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>الاسم والتوقيع</div>
            </div>
            <div>
              <div className="sig-title">أمين المستودع المسؤول</div>
              <div className="sig-line"></div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>الاسم والتوقيع</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
