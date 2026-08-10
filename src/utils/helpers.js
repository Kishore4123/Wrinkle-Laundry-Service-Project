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
 * Format a bill ID: WLS-YYMMDD-XXX
 */
export function formatBillId(dateStr, sequence) {
  const seqStr = String(sequence).padStart(3, '0');
  return `WLS-${dateStr}-${seqStr}`;
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
 * Supports new cart-based bills and legacy single-service bills
 */
export function buildBillMessage(bill) {
  const customerName = bill.customerName || bill.studentName || 'Customer';
  const customerCategory = bill.customerCategory || 'Student';

  let itemsSection = '';

  if (bill.cartItems && bill.cartItems.length > 0) {
    // New cart-based bill
    bill.cartItems.forEach((cartItem, idx) => {
      const serviceLabel = SERVICE_TYPES[cartItem.serviceType]?.label || cartItem.serviceType;
      itemsSection += `\n🔹 *Service ${idx + 1}: ${serviceLabel}*`;
      if (cartItem.isPiecewise) {
        itemsSection += `\n   👕 Items:`;
        if (cartItem.items && cartItem.items.length > 0) {
          cartItem.items.forEach(i => {
            itemsSection += `\n      - ${i.count}× ${i.label || i.category} @ ₹${i.rate}/pc = ₹${i.count * i.rate}`;
          });
        }
      } else {
        itemsSection += `\n   ⚖️ Weight: ${cartItem.weight} kg`;
        if (cartItem.items && cartItem.items.length > 0) {
          const itemsList = cartItem.items.map((i) => `${i.count}× ${i.label || i.category}`).join(', ');
          itemsSection += `\n   👕 Items: ${itemsList}`;
        }
        itemsSection += `\n   💰 Rate: ₹${cartItem.ratePerKg}/kg`;
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

  return `Wrinkle Release Laundry Service, Near Covai Residency, Madhvarayapuram, Siruvani Road, Coimbatore. Phone no. : +91 96007 63725
  
*🧺 Laundry Bill Receipt*
*Bill No:* ${bill.id}
━━━━━━━━━━━━━━━━━━━━
👤 *Customer:* ${customerName}
🏷️ *Type:* ${customerCategory}
📅 *Date:* ${formatDate(bill.createdAt)}
━━━━━━━━━━━━━━━━━━━━${itemsSection}
━━━━━━━━━━━━━━━━━━━━
*💵 Total Amount: ₹${bill.totalAmount}*
━━━━━━━━━━━━━━━━━━━━
Thank you for using Wrinkle Laundry Service! 🙏

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
 * Get total items count from a clothing items array
 */
export function getTotalItemsCount(items) {
  if (!items || items.length === 0) return 0;
  return items.reduce((sum, item) => sum + (item.count || 0), 0);
}
