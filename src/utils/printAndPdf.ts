import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "sonner";

/**
 * Print HTML document seamlessly via hidden iframe without opening blank tabs
 */
export function printDocumentHtml(htmlContent: string, title: string = "document") {
  try {
    // Remove old print iframes
    const old = document.getElementById("erp-print-iframe");
    if (old) old.remove();

    const iframe = document.createElement("iframe");
    iframe.id = "erp-print-iframe";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) {
      toast.error("تعذر فتح نافذة الطباعة");
      return;
    }

    doc.open();
    // Inject print-friendly styling
    doc.write(htmlContent);
    doc.close();

    // Give browser time to parse CSS, webfonts, and QR images
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error("Print error:", err);
        toast.error("فشل أمر الطباعة");
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 3000);
      }
    }, 350);
  } catch (err) {
    console.error("Print execution failed:", err);
    toast.error("حدث خطأ أثناء إرسال أمر الطباعة");
  }
}

/**
 * Render HTML content to an actual PDF file and trigger download
 */
export async function saveDocumentPdfFromHtml(htmlContent: string, filename: string) {
  const toastId = toast.loading("جاري إعداد وإنشاء ملف PDF...");
  let container: HTMLDivElement | null = null;
  try {
    // Create temporary off-screen container formatted for A4
    container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "0";
    container.style.width = "794px"; // Standard A4 width in px at 96 DPI
    container.style.background = "#ffffff";
    container.style.color = "#0f172a";
    container.style.zIndex = "-9999";
    container.innerHTML = htmlContent;

    // Remove any <script> tags from inside container to avoid execution
    const scripts = container.querySelectorAll("script");
    scripts.forEach((s) => s.remove());

    document.body.appendChild(container);

    // Wait for any images / QR codes to load
    const images = Array.from(container.querySelectorAll("img"));
    await Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) resolve(true);
            else {
              img.onload = () => resolve(true);
              img.onerror = () => resolve(true);
            }
          })
      )
    );

    // Render with html2canvas
    const canvas = await html2canvas(container, {
      scale: 2, // High resolution (crisp text & QR)
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = 210; // A4 mm
    const pageHeight = 297; // A4 mm
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    // First page
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;

    // Subsequent pages if long document
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
      heightLeft -= pageHeight;
    }

    const safeName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    pdf.save(safeName);

    toast.dismiss(toastId);
    toast.success(`تم حفظ ${safeName} بنجاح`);
  } catch (err) {
    console.error("PDF generation failed:", err);
    toast.dismiss(toastId);
    toast.error("فشل حفظ ملف PDF، يمكنك استخدام خيار طباعة A4 واختيار Save as PDF");
  } finally {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

/**
 * Share document summary via WhatsApp
 */
export function shareDocumentWhatsApp(phone?: string | null, text?: string) {
  try {
    const cleanPhone = (phone || "").replace(/[^0-9]/g, "");
    let formattedPhone = cleanPhone;
    if (formattedPhone.startsWith("05")) {
      formattedPhone = "966" + formattedPhone.slice(1);
    } else if (formattedPhone.startsWith("5") && formattedPhone.length === 9) {
      formattedPhone = "966" + formattedPhone;
    }

    const encoded = encodeURIComponent(text || "");
    const waUrl = formattedPhone
      ? `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;

    window.open(waUrl, "_blank", "noopener,noreferrer");
    toast.success("تم فتح تطبيق واتساب للمشاركة");
  } catch (err) {
    console.error("WhatsApp share failed:", err);
    toast.error("تعذر فتح واتساب");
  }
}
