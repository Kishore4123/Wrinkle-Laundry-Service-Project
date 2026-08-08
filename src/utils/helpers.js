// Utility helper functions for the Laundry App

/**
 * Generate a random alphanumeric ID
 */
export function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a bill ID in the format BILL-XXXXXX
 */
export function generateBillId() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `BILL-${code}`;
}

/**
 * Format a timestamp to a human-readable date/time string
 */
export function formatDate(timestamp) {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Format a date for short display (e.g., "06 Aug 2026")
 */
export function formatDateShort(timestamp) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Format currency as Indian Rupees
 */
export function formatCurrency(amount) {
  return `₹${Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Build a WhatsApp deep link URL
 * @param {string} mobile - 10-digit mobile number
 * @param {string} message - Pre-filled message text
 */
export function buildWhatsAppUrl(mobile, message) {
  const phone = `91${mobile}`; // Indian country code
  const encodedMessage = encodeURIComponent(message);
  return `whatsapp://send?phone=${phone}&text=${encodedMessage}`;
}

/**
 * Build the bill receipt message for WhatsApp
 */
export function buildBillMessage(bill) {
  const serviceLabel = bill.serviceType === 'WASH_ONLY'
    ? 'Washing Only'
    : 'Washing & Ironing';

  return `*🧺 Laundry Bill Receipt - College Laundry Services*
━━━━━━━━━━━━━━━━━━━━
👤 *Student:* ${bill.studentName}
🆔 *Reg No:* ${bill.regNo}
📅 *Date:* ${formatDate(bill.createdAt)}
━━━━━━━━━━━━━━━━━━━━
⚖️ *Weight:* ${bill.weight} kg
👕 *No. of Items:* ${bill.clothesCount}
🔧 *Service:* ${serviceLabel}
💰 *Rate:* ₹${bill.ratePerKg}/kg
━━━━━━━━━━━━━━━━━━━━
*💵 Total Amount: ₹${bill.totalAmount}*
━━━━━━━━━━━━━━━━━━━━
Thank you for using our service! 🙏

📌 *Scan this QR Code for your bill details:*
https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${bill.id}`;
}

/**
 * Validate a 10-digit mobile number
 */
export function isValidMobile(mobile) {
  return /^\d{10}$/.test(mobile);
}

/**
 * Validate registration number (alphanumeric, at least 2 chars)
 */
export function isValidRegNo(regNo) {
  return /^[A-Za-z0-9]{2,}$/.test(regNo.replace(/[\s\-\/]/g, ''));
}
