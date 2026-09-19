// Persistent storage service using AsyncStorage
// Handles all CRUD operations for Customers and Bills
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId } from '../utils/helpers';

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
      synced: false,
    };

    customers.push(newCustomer);
    await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
    return newCustomer;
  },

  async markSynced(customerId) {
    const customers = await this.getAll();
    const i = customers.findIndex((c) => c.id === customerId);
    if (i !== -1) {
      customers[i].synced = true;
      await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
    }
  },

  async getPendingSync() {
    const customers = await this.getAll();
    return customers.filter((c) => c.synced !== true);
  },

  /** Upsert customers arriving from the shared directory. */
  async cacheCustomers(remote) {
    if (!remote || remote.length === 0) return;
    const customers = await this.getAll();
    const byId = new Map(customers.map((c) => [c.id, c]));
    for (const r of remote) {
      if (!r.id) continue;
      byId.set(r.id, { ...(byId.get(r.id) || {}), ...r, synced: true });
    }
    await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify(Array.from(byId.values())));
  },

  /** Remove a customer locally only — used when another device deleted it. */
  async deleteLocal(customerId) {
    const customers = await this.getAll();
    await AsyncStorage.setItem(
      CUSTOMERS_KEY,
      JSON.stringify(customers.filter((c) => c.id !== customerId))
    );
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
      // Stats changed, so this record needs republishing to the other devices.
      customers[index].synced = false;
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
   * Get only current (active/pending) bills — excludes completed ones
   */
  async getCurrentBills() {
    const bills = await this.getAll();
    return bills.filter((b) => b.status !== 'Completed');
  },

  /**
   * Get only completed (paid) bills
   */
  async getCompletedBills() {
    const bills = await this.getAll();
    return bills.filter((b) => b.status === 'Completed');
  },

  /**
   * Save a new bill with cart-based structure.
   * billData.cartItems is an array of:
   *   { serviceType, weight, items: [{category, count}], ratePerKg, subtotal }
   *
   * The billId is allocated by the caller from the centralized Firestore counter —
   * this function never invents one, because locally-derived sequences collide
   * across devices.
   */
  async save(billData, billId) {
    if (!billId) throw new Error('billId is required — allocate it before saving.');
    const bills = await this.getAll();

    const newBill = {
      id: billId,
      customerId: billData.customerId,
      customerName: billData.customerName,
      customerCategory: billData.customerCategory || 'Student',
      mobile: billData.mobile,
      cartItems: billData.cartItems || [],
      totalWeight: billData.totalWeight || 0,
      totalClothesCount: billData.totalClothesCount || 0,
      totalAmount: billData.totalAmount,
      dueDate: billData.dueDate,
      status: 'Pending',
      createdAt: Date.now(),
      synced: false,
    };

    bills.push(newBill);
    await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(bills));
    return newBill;
  },

  async markSynced(billId) {
    const bills = await this.getAll();
    const i = bills.findIndex((b) => b.id === billId);
    if (i !== -1) {
      bills[i].synced = true;
      await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(bills));
    }
  },

  async getPendingSync() {
    const bills = await this.getAll();
    return bills.filter((b) => b.synced !== true);
  },

  async applyRemoteStatus(billId, status, completedAt) {
    const bills = await this.getAll();
    const i = bills.findIndex((b) => b.id === billId);
    if (i === -1) return;
    bills[i].status = status;
    if (completedAt) bills[i].completedAt = completedAt;
    await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(bills));
  },

  /**
   * Upsert bills retrieved from the desktop archive so they behave exactly like
   * locally-created ones. Marked synced — the desktop already has them.
   */
  async cacheBills(remoteBills) {
    if (!remoteBills || remoteBills.length === 0) return;
    const bills = await this.getAll();
    const byId = new Map(bills.map((b) => [b.id, b]));
    for (const remote of remoteBills) {
      const id = remote.id || remote.billId;
      if (!id) continue;
      byId.set(id, { ...(byId.get(id) || {}), ...remote, id, synced: true });
    }
    await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(Array.from(byId.values())));
  },

  async delete(billId) {
    const bills = await this.getAll();
    await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(bills.filter((b) => b.id !== billId)));
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
   * Mark a bill as completed/paid — moves it to completed history
   * Updates customer stats and sets status to 'Completed'
   */
  async markBillAsCompleted(billId) {
    const bills = await this.getAll();
    const billIndex = bills.findIndex((b) => b.id === billId);
    if (billIndex !== -1) {
      const bill = bills[billIndex];
      const totalWeight = bill.totalWeight || bill.weight || 0;
      const customerId = bill.customerId || bill.studentId;

      // 1. Update customer stats
      await CustomerService.updateStats(customerId, totalWeight, bill.totalAmount);

      // 2. Mark as completed (do NOT delete)
      bills[billIndex].status = 'Completed';
      bills[billIndex].completedAt = new Date().toISOString();

      await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(bills));
    }
  },

  /**
   * Legacy: Mark payment as done (kept for backward compat — now calls markBillAsCompleted)
   */
  async markPaymentDone(billId) {
    return this.markBillAsCompleted(billId);
  },
};
