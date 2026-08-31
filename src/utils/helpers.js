// Utility helper functions for the Laundry App

import { SERVICE_TYPES } from '../theme/theme';

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
 * Format a bill ID: WR-YYMMDD-XXX
 */
export function formatBillId(dateStr, sequence) {
  const seqStr = String(sequence).padStart(3, '0');
  return `WR-${dateStr}-${seqStr}`;
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
 * Build a mobile-friendly monospace item table for WhatsApp.
 * Two-line layout per item: name on line 1, price/qty/total on line 2.
 * Wrapped in triple backticks for monospace rendering.
 * Uses padEnd/padStart for strict column alignment.
 * @param {Array} items - Array of {label/category, rate, count}
 * @param {boolean} isPiecewise - Whether to show price/total or dashes
 */
function buildItemTable(items, isPiecewise) {
  const COL_PRICE = 13;
  const COL_QTY = 9;

  const divider = '-'.repeat(30);
  const header = 'Item - Name';
  const subHeader = 'Price'.padEnd(COL_PRICE) + 'Qty'.padEnd(COL_QTY) + 'Total';

  let rows = '';
  items.forEach((i, idx) => {
    const name = i.label || i.category || '';
    const price = isPiecewise ? ('\u20b9' + i.rate).padEnd(COL_PRICE) : '-'.padEnd(COL_PRICE);
    const qty = ('x ' + i.count).padEnd(COL_QTY);
    const total = isPiecewise ? '\u20b9' + (i.count * i.rate) : '-';
    const spacer = idx > 0 ? '\n' : '';
    rows += `${spacer}\n${name}\n${price}${qty}${total.padStart(7)}`;
  });

  return '```text\n' +
    divider + '\n' +
    header + '\n' +
    divider + '\n' +
    subHeader + '\n' +
    divider +
    rows + '\n```';
}

/**
 * Build the bill receipt message for WhatsApp
 * Supports new cart-based bills and legacy single-service bills
 */
export function buildBillMessage(bill) {
  const customerName = bill.customerName || bill.studentName || 'Customer';
  const customerCategory = bill.customerCategory || 'Student';

  // Build centered bold bill number header
  const billIdStr = `*Bill No: ${bill.id}*`;
  const centeredBillId = billIdStr.padStart(38 + Math.floor(billIdStr.length / 2));

  let itemsSection = '';

  if (bill.cartItems && bill.cartItems.length > 0) {
    // New cart-based bill
    bill.cartItems.forEach((cartItem, idx) => {
      const serviceLabel = SERVICE_TYPES[cartItem.serviceType]?.label || cartItem.serviceType;
      // Split service label for "Wash &\nIron" style line break if it contains "&"
      const formattedLabel = serviceLabel.replace(/ & /g, ' &\n');
      itemsSection += `\n🔹 Service ${idx + 1}: ${formattedLabel}`;
      itemsSection += '\n';
      if (cartItem.isPiecewise) {
        if (cartItem.items && cartItem.items.length > 0) {
          itemsSection += '\n' + buildItemTable(cartItem.items, true);
        }
      } else {
        itemsSection += `\n   ⚖️ Weight: ${cartItem.weight} kg`;
        itemsSection += `\n   💰 Rate: ₹${cartItem.ratePerKg}/kg`;
        if (cartItem.items && cartItem.items.length > 0) {
          itemsSection += '\n' + buildItemTable(cartItem.items, false);
        }
      }
      itemsSection += `\n   📋 Subtotal: ₹${cartItem.subtotal}`;
      itemsSection += '\n';
    });
  } else {
    // Legacy single-service bill
    const serviceLabel = bill.serviceType === 'WASH_ONLY'
      ? 'Washing Only'
      : SERVICE_TYPES[bill.serviceType]?.label || bill.serviceType || 'Washing & Ironing';
    itemsSection = `
⚖️ *Weight:* ${bill.weight || bill.totalWeight} kg
👕 *No. of Items:* ${bill.clothesCount || bill.totalClothesCount}
🔧 *Service:* ${serviceLabel}
💰 *Rate:* ₹${bill.ratePerKg}/kg`;
  }

  const dueDateSection = bill.dueDate ? `\n📅 *Due:* ${bill.dueDate}` : '';

  return `${centeredBillId}
 
Wrinkle Release Laundry Service
Near Covai Residency,
Madhvarayapuram,
Coimbatore.
📞 +91 96007 63725
🧺 Laundry Bill Receipt
━━━━━━━━━━━━━━━━━━━━
👤 Customer: ${customerName}
📅 Date: ${formatDate(bill.createdAt)}${dueDateSection}
━━━━━━━━━━━━━━━━━━━━${itemsSection}
━━━━━━━━━━━━━━━━━━━━
💵 Total Amount: ₹${bill.totalAmount}
━━━━━━━━━━━━━━━━━━━━
Thank you for using Wrinkle Release Laundry Service! 🙏

Terms & Conditions:
We are not responsible for color bleeding or shrinkage.
Please check your garments before handing them over.
Not responsible for items left over 30 days.

📌 Scan this QR Code for your bill details:
https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${bill.id}`;
}

/**
 * Validate a 10-digit mobile number
 */
export function isValidMobile(mobile) {
  return /^\d{10}$/.test(mobile);
}

/**
 * Get total items count from a clothing items array
 */
export function getTotalItemsCount(items) {
  if (!items || items.length === 0) return 0;
  return items.reduce((sum, item) => sum + (item.count || 0), 0);
}

/**
 * Build the "Order Ready" WhatsApp notification message
 * @param {object} bill - The bill object
 * @param {string} deliveryDate - The chosen delivery date string
 */
export function buildOrderReadyMessage(bill, deliveryDate) {
  const customerName = bill.customerName || bill.studentName || 'Customer';
  const deliveryDateLine = deliveryDate ? `\n📅 *Delivery Date:* ${deliveryDate}\n` : '';
  return `*Wrinkle Release Laundry Service* 🧺✨

Dear *${customerName}*,

Your laundry order *${bill.id}* is now ready for delivery! 🎉
${deliveryDateLine}
Please collect your garments at your earliest convenience.

Thank you for choosing *Wrinkle Release Laundry Service*! 🙏

📞 +91 96007 63725`;
}
