/**
 * ZATCA Phase 1 E-Invoicing QR Code TLV (Tag-Length-Value) Base64 Generator
 * Single Source of Truth: SPEC.md (v3.1) Section 1 & Section 6.5
 * Fully compliant with ZATCA (Fatoora) Phase 1 Validator.
 */

export interface ZatcaQrData {
  sellerName: string;
  vatNumber: string;
  timestamp: string; // ISO 8601 (e.g. 2026-11-21T14:30:00Z)
  totalAmount: string; // Total with VAT (e.g. "1150.00")
  vatAmount: string; // VAT Total (e.g. "150.00")
}

/**
 * Encodes a string value into a ZATCA TLV byte array.
 * Tag 1: Seller Name
 * Tag 2: VAT Number
 * Tag 3: Timestamp
 * Tag 4: Invoice Total (with VAT)
 * Tag 5: VAT Total
 */
function encodeTlvField(tag: number, value: string): Uint8Array {
  const encoder = new TextEncoder();
  const valueBytes = encoder.encode(value);
  const length = valueBytes.length;

  const tlv = new Uint8Array(2 + length);
  tlv[0] = tag;
  tlv[1] = length;
  tlv.set(valueBytes, 2);

  return tlv;
}

/**
 * Generates standard ZATCA Phase 1 Base64 encoded TLV string.
 */
export function generateZatcaTlvBase64(data: ZatcaQrData): string {
  const tlv1 = encodeTlvField(1, data.sellerName || "مصنع الأسياح للمنظفات");
  const tlv2 = encodeTlvField(2, data.vatNumber || "300000000000003");
  const tlv3 = encodeTlvField(3, data.timestamp || new Date().toISOString());
  const tlv4 = encodeTlvField(4, Number(data.totalAmount).toFixed(2));
  const tlv5 = encodeTlvField(5, Number(data.vatAmount).toFixed(2));

  const totalLength = tlv1.length + tlv2.length + tlv3.length + tlv4.length + tlv5.length;
  const combined = new Uint8Array(totalLength);

  let offset = 0;
  [tlv1, tlv2, tlv3, tlv4, tlv5].forEach((tlv) => {
    combined.set(tlv, offset);
    offset += tlv.length;
  });

  // Convert Uint8Array to binary string and then Base64
  let binary = "";
  for (let i = 0; i < combined.byteLength; i++) {
    binary += String.fromCharCode(combined[i]);
  }

  return btoa(binary);
}
