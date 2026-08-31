// Persistent storage service using AsyncStorage
// Handles all CRUD operations for Customers and Bills
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId, generateBillId } from '../utils/helpers';

const CUSTOMERS_KEY = '@laundry_customers';
const BILLS_KEY = '@laundry_bills';
// Legacy key for backward compatibility
const STUDENTS_KEY = '@laundry_students';

// ============================================================
// Customer Service (formerly StudentService)
// ============================================================
export const CustomerService = {
  /**
   * Get all customers, sorted alphabetically by name.
   * Also migrates legacy student data if present.
   */
  async getAll() {
    try {
      let data = await AsyncStorage.getItem(CUSTOMERS_KEY);

      // Migrate legacy student data if customers key doesn't exist
      if (!data) {
        const legacyData = await AsyncStorage.getItem(STUDENTS_KEY);
        if (legacyData) {
          const legacyStudents = JSON.parse(legacyData);
          // Migrate: add default category, keep all existing fields
          const migrated = legacyStudents.map((s) => ({
            ...s,
            category: s.category || 'Student',
          }));
          await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify(migrated));
          data = JSON.stringify(migrated);
        }
      }

      const customers = data ? JSON.parse(data) : [];
      return customers.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Error getting customers:', error);
      return [];
    }
  },

  /**
   * Add a new customer (no regNo required).
   * Duplicate detection is based on name + mobile.
   */
  async add(customer) {
    const customers = await this.getAll();

    const newCustomer = {
      id: generateId(),
      name: customer.name.trim(),
      mobile: customer.mobile.trim(),
      category: customer.category || 'Student',
      totalWeight: 0,
      totalAmountPaid: 0,
      createdAt: Date.now(),
    };

    customers.push(newCustomer);
    await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
    return newCustomer;
  },

  /**
   * Delete a customer by ID
   */
  async delete(id) {
    const customers = await this.getAll();
    const filtered = customers.filter((c) => c.id !== id);
    await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify(filtered));
  },

  /**
   * Search customers by name, mobile, or category (case-insensitive)
   */
  async search(query) {
    if (!query || query.trim().length === 0) {
      return this.getAll();
    }
    const customers = await this.getAll();
    const q = query.toLowerCase().trim();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.mobile.includes(q) ||
        (c.category && c.category.toLowerCase().includes(q))
    );
  },

  /**
   * Get a customer by ID
   */
  async getById(id) {
    const customers = await this.getAll();
    return customers.find((c) => c.id === id) || null;
  },

  /**
   * Accumulate lifetime stats for a customer
   */
  async updateStats(customerId, addedWeight, addedAmount) {
    const customers = await this.getAll();
    const index = customers.findIndex((c) => c.id === customerId);
    if (index !== -1) {
      customers[index].totalWeight = (customers[index].totalWeight || 0) + addedWeight;
      customers[index].totalAmountPaid = (customers[index].totalAmountPaid || 0) + addedAmount;
      await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
    }
  },
};

// Keep backward-compatible alias
export const StudentService = CustomerService;

// ============================================================
// Bill Service
// ============================================================
export const BillService = {
  /**
   * Get all bills, sorted newest first
   */
  async getAll() {
    try {
      const data = await AsyncStorage.getItem(BILLS_KEY);
      const bills = data ? JSON.parse(data) : [];
      return bills.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('Error getting bills:', error);
      return [];
    }
  },

  /**
   * Save a new bill with cart-based structure.
   * billData.cartItems is an array of:
   *   { serviceType, weight, items: [{category, count}], ratePerKg, subtotal }
   */
  async save(billData) {
    const bills = await this.getAll();

    // Generate Sequential ID: WR-YYMMDD-XXX
    const today = new Date();
    const yy = String(today.getFullYear()).slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const datePrefix = `${yy}${mm}${dd}`;

    let maxSeq = 0;
    const prefixStr = `WR-${datePrefix}-`;

    bills.forEach(b => {
      if (b.id && b.id.startsWith(prefixStr)) {
        const seqStr = b.id.replace(prefixStr, '');
        const seq = parseInt(seqStr, 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });

    const newSeq = maxSeq + 1;
    const newBillId = `WR-${datePrefix}-${String(newSeq).padStart(3, '0')}`;

    const newBill = {
      id: newBillId,
      customerId: billData.customerId,
      customerName: billData.customerName,
      customerCategory: billData.customerCategory || 'Student',
      mobile: billData.mobile,
      cartItems: billData.cartItems || [],
      totalWeight: billData.totalWeight || 0,
      totalClothesCount: billData.totalClothesCount || 0,
      totalAmount: billData.totalAmount,
      createdAt: Date.now(),
    };

    bills.push(newBill);
    await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(bills));
    return newBill;
  },

  /**
   * Search bills by name, mobile, date, or bill ID
   */
  async search(query) {
    if (!query || query.trim().length === 0) {
      return this.getAll();
    }
    const bills = await this.getAll();
    const q = query.toLowerCase().trim();
    return bills.filter((b) => {
      const dateStr = new Date(b.createdAt).toLocaleDateString('en-IN');
      const name = b.customerName || b.studentName || '';
      return (
        name.toLowerCase().includes(q) ||
        dateStr.includes(q) ||
        b.id.toLowerCase().includes(q) ||
        (b.mobile && b.mobile.includes(q))
      );
    });
  },

  /**
   * Get a bill by ID
   */
  async getById(id) {
    const bills = await this.getAll();
    return bills.find((b) => b.id === id) || null;
  },

  /**
   * Mark payment as done (Update customer stats and delete the bill)
   */
  async markPaymentDone(billId) {
    const bills = await this.getAll();
    const billIndex = bills.findIndex((b) => b.id === billId);
    if (billIndex !== -1) {
      const bill = bills[billIndex];
      const totalWeight = bill.totalWeight || bill.weight || 0;
      const customerId = bill.customerId || bill.studentId;
      // 1. Update customer stats
      await CustomerService.updateStats(customerId, totalWeight, bill.totalAmount);
      // 2. Remove bill from storage
      bills.splice(billIndex, 1);
      await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(bills));
    }
  },
};
