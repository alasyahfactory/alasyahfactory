import React, { useRef } from "react";
import { Printer, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StocktakingSession, FactorySettings } from "@/types/database";

interface StockReconciliationPrintProps {
  session: StocktakingSession;
  settings: FactorySettings | null;
}

export const StockReconciliationPrint: React.FC<StockReconciliationPrintProps> = ({ session, settings }) => {
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
          <title>${session.session_number} - تقرير مطابقة وعجز الجرد</title>
          <meta charset="utf-8" />
          <style>
            @page {
              size: A4 landscape;
              margin: 10mm;
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
              padding-bottom: 8px;
              margin-bottom: 10px;
            }
            .title-box {
              text-align: center;
            }
            .recon-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 15px;
            }
            .recon-table th, .recon-table td {
              border: 1px solid #cbd5e1;
              padding: 5px 6px;
            }
            .recon-table th {
              background-color: #f1f5f9;
              font-weight: 700;
              text-align: center;
              font-size: 10px;
            }
            .num-cell {
              font-family: monospace;
              text-align: right;
            }
            .shortage-text {
              color: #b91c1c;
              font-weight: bold;
            }
            .surplus-text {
              color: #047857;
              font-weight: bold;
            }
            .total-row td {
              font-weight: 800;
              background-color: #f8fafc;
            }
            .signatures {
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 20px;
              text-align: center;
              margin-top: 30px;
              padding-top: 15px;
              border-top: 1px dashed #cbd5e1;
            }
            .sig-title {
              font-weight: 700;
              margin-bottom: 35px;
            }
            .sig-line {
              border-top: 1px solid #64748b;
              margin: 0 40px;
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
        className="h-8 gap-1.5 text-xs font-semibold text-emerald-800 border-emerald-300 hover:bg-emerald-50"
      >
        <FileCheck className="h-3.5 w-3.5" />
        <span>تقرير مطابقة وعجز الجرد (A4)</span>
      </Button>

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
              <div style={{ fontSize: "15px", fontWeight: "bold" }}>
                محضر مطابقة الجرد الفعلي وتسوية العجز / الفائض المخزني
              </div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>
                مستودع: {session.warehouse?.name_ar || "المستودع الرئيسي"} — جلسة رقم: {session.session_number}
              </div>
            </div>

            <div style={{ textAlign: "left", direction: "ltr" }}>
              <div style={{ fontSize: "12px", fontWeight: "bold" }}>
                {settings?.name_en || "Al-Asyah Detergent Factory"}
              </div>
              <div>Date: {session.session_date}</div>
            </div>
          </div>

          {/* Table */}
          <table className="recon-table">
            <thead>
              <tr>
                <th>#</th>
                <th>كود الصنف</th>
                <th>اسم الصنف / المادة</th>
                <th>الكمية الدفترية (FIFO)</th>
                <th>الكمية الفعلية المجرودة</th>
                <th>الفارق بالكمية</th>
                <th>تكلفة الوحدة</th>
                <th>قيمة الفارق المالي (SAR)</th>
                <th>الأثر المحاسبي والترحيل</th>
              </tr>
            </thead>
            <tbody>
              {session.lines?.map((line, idx) => {
                const isShortage = (line.variance_amount || 0) < 0;
                const isSurplus = (line.variance_amount || 0) > 0;

                return (
                  <tr key={line.id || idx}>
                    <td style={{ textAlign: "center" }}>{idx + 1}</td>
                    <td style={{ fontFamily: "monospace", fontWeight: "bold" }}>{line.item?.sku}</td>
                    <td style={{ fontWeight: "bold" }}>{line.item?.name_ar}</td>
                    <td className="num-cell">{line.system_qty}</td>
                    <td className="num-cell" style={{ fontWeight: "bold" }}>{line.physical_qty ?? "-"}</td>
                    <td className={`num-cell ${isShortage ? "shortage-text" : isSurplus ? "surplus-text" : ""}`}>
                      {line.variance_qty ? (line.variance_qty > 0 ? `+${line.variance_qty}` : line.variance_qty) : "0"}
                    </td>
                    <td className="num-cell">{line.unit_cost.toFixed(2)}</td>
                    <td className={`num-cell ${isShortage ? "shortage-text" : isSurplus ? "surplus-text" : ""}`}>
                      {line.variance_amount ? `${line.variance_amount.toFixed(2)} ر.س` : "0.00 ر.س"}
                    </td>
                    <td style={{ textAlign: "center", fontSize: "10px" }}>
                      {isShortage ? "عجز مخزني (حـ/ 6107)" : isSurplus ? "فائض جرد (حـ/ 4201)" : "مطابق تماماً"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan={7} style={{ textAlign: "center" }}>
                  صافي فارق تسوية الجرد المخزني المرحل للنظام:
                </td>
                <td className={`num-cell ${session.net_variance_cost < 0 ? "shortage-text" : "surplus-text"}`} style={{ fontSize: "12px" }}>
                  {session.net_variance_cost.toFixed(2)} ر.س
                </td>
                <td style={{ textAlign: "center" }}>
                  {session.journal_entry_id ? "قيد محاسبي متوازن مرحل" : "جاهز للترحيل"}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Signatures */}
          <div className="signatures">
            <div>
              <div className="sig-title">رئيس لجنة الجرد الميداني</div>
              <div className="sig-line"></div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>الاسم والتوقيع</div>
            </div>
            <div>
              <div className="sig-title">المحاسب المالي (التدقيق والترحيل)</div>
              <div className="sig-line"></div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>الاسم والتوقيع</div>
            </div>
            <div>
              <div className="sig-title">المدير العام (المصادقة والاعتماد)</div>
              <div className="sig-line"></div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>الاسم والتوقيع والختم</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
