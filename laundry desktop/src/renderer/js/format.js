// format.js — port of the mobile app's utils/helpers.js.
//
// The WhatsApp receipt must be byte-identical to the one phones send, so this
// mirrors buildBillMessage exactly. If you change the format here, change it in
// `laundry app/src/utils/helpers.js` too — customers get both.

const SERVICE_TYPES = {
    WASH_ONLY:     { key: 'WASH_ONLY',     label: 'Washing Only',  defaultRate: 80,  icon: '🧺' },
    WASH_AND_IRON: { key: 'WASH_AND_IRON', label: 'Wash & Iron',   defaultRate: 125, icon: '👔' },
    IRON_STEAM:    { key: 'IRON_STEAM',    label: 'Steam Ironing', defaultRate: 60,  icon: '♨️' },
};

const CLOTHING_CATEGORIES = [
    { key: 'shirt', label: 'Shirt' },
    { key: 'tshirt', label: 'T-Shirt' },
    { key: 'pants', label: 'Pants / Trousers' },
    { key: 'jeans', label: 'Jeans' },
    { key: 'shorts', label: 'Shorts' },
    { key: 'saree', label: 'Saree' },
    { key: 'kurta', label: 'Kurta / Kurti' },
    { key: 'dress', label: 'Dress' },
    { key: 'jacket', label: 'Jacket / Hoodie' },
    { key: 'towel', label: 'Towel' },
    { key: 'bedsheet', label: 'Bedsheet' },
    { key: 'blanket', label: 'Blanket' },
    { key: 'curtain', label: 'Curtain' },
    { key: 'pillow_cover', label: 'Pillow Cover' },
    { key: 'other', label: 'Other' },
];

function generateId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 20; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

function formatBillId(dateStr, sequence) {
    return `WR-${dateStr}-${String(sequence).padStart(3, '0')}`;
}

function datePrefixToday() {
    const now = new Date();
    return `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function formatDateShort(timestamp) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const date = new Date(timestamp);
    return `${String(date.getDate()).padStart(2, '0')} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatCurrency(amount) {
    return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function isValidMobile(mobile) {
    return /^\d{10}$/.test(String(mobile || '').trim());
}

/**
 * Monospace item table, two lines per item. Column widths and padding match the
 * mobile implementation so the receipt lines up identically in WhatsApp.
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
        const price = isPiecewise ? ('₹' + i.rate).padEnd(COL_PRICE) : '-'.padEnd(COL_PRICE);
        const qty = ('x ' + i.count).padEnd(COL_QTY);
        const total = isPiecewise ? '₹' + (i.count * i.rate) : '-';
        const spacer = idx > 0 ? '\n' : '';
        rows += `${spacer}\n${name}\n${price}${qty}${total.padStart(7)}`;
    });

    return '```text\n' + divider + '\n' + header + '\n' + divider + '\n' + subHeader + '\n' + divider + rows + '\n```';
}

function buildBillMessage(bill) {
    const customerName = bill.customerName || bill.studentName || 'Customer';

    const billIdStr = `*Bill No: ${bill.id || bill.billId}*`;
    const centeredBillId = billIdStr.padStart(38 + Math.floor(billIdStr.length / 2));

    let itemsSection = '';
    const cartItems = bill.cartItems || [];

    if (cartItems.length > 0) {
        cartItems.forEach((cartItem, idx) => {
            const serviceLabel = SERVICE_TYPES[cartItem.serviceType]?.label || cartItem.serviceType;
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
    const createdAt = bill.createdAt || (bill.timestamp ? Date.parse(bill.timestamp) : Date.now());

    return `${centeredBillId}

Wrinkle Release Laundry Service
Near Covai Residency,
Madhvarayapuram,
Coimbatore.
📞 +91 96007 63725
🧺 Laundry Bill Receipt
━━━━━━━━━━━━━━━━━━━━
👤 Customer: ${customerName}
📅 Date: ${formatDate(createdAt)}${dueDateSection}
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
https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${bill.id || bill.billId}`;
}

function buildOrderReadyMessage(bill, deliveryDate) {
    const customerName = bill.customerName || bill.studentName || 'Customer';
    const deliveryDateLine = deliveryDate ? `\n📅 *Delivery Date:* ${deliveryDate}\n` : '';
    return `*Wrinkle Release Laundry Service* 🧺✨

Dear *${customerName}*,

Your laundry order *${bill.id || bill.billId}* is now ready for delivery! 🎉
${deliveryDateLine}
Please collect your garments at your earliest convenience.

Thank you for choosing *Wrinkle Release Laundry Service*! 🙏

📞 +91 96007 63725`;
}

window.Fmt = {
    SERVICE_TYPES,
    CLOTHING_CATEGORIES,
    generateId,
    formatBillId,
    datePrefixToday,
    formatDate,
    formatDateShort,
    formatCurrency,
    isValidMobile,
    buildBillMessage,
    buildOrderReadyMessage,
};
