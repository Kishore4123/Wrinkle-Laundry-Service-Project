// Persistent storage service using AsyncStorage
// Handles all CRUD operations for Students and Bills
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId, generateBillId } from '../utils/helpers';

const STUDENTS_KEY = '@laundry_students';
const BILLS_KEY = '@laundry_bills';

// ============================================================
// Student Service
// ============================================================
export const StudentService = {
  /**
   * Get all students, sorted alphabetically by name
   */
  async getAll() {
    try {
      const data = await AsyncStorage.getItem(STUDENTS_KEY);
      const students = data ? JSON.parse(data) : [];
      return students.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Error getting students:', error);
      return [];
    }
  },

  /**
   * Add a new student. Throws if regNo already exists.
   */
  async add(student) {
    const students = await this.getAll();
    const existing = students.find(
      (s) => s.regNo.toLowerCase() === student.regNo.toLowerCase()
    );
    if (existing) {
      throw new Error(`A student with Reg No "${student.regNo}" already exists.`);
    }

    const newStudent = {
      id: generateId(),
      name: student.name.trim(),
      regNo: student.regNo.trim().toUpperCase(),
      mobile: student.mobile.trim(),
      totalWeight: 0,
      totalAmountPaid: 0,
      createdAt: Date.now(),
    };

    students.push(newStudent);
    await AsyncStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
    return newStudent;
  },

  /**
   * Delete a student by ID
   */
  async delete(id) {
    const students = await this.getAll();
    const filtered = students.filter((s) => s.id !== id);
    await AsyncStorage.setItem(STUDENTS_KEY, JSON.stringify(filtered));
  },

  /**
   * Search students by name, regNo, or mobile (case-insensitive)
   */
  async search(query) {
    if (!query || query.trim().length === 0) {
      return this.getAll();
    }
    const students = await this.getAll();
    const q = query.toLowerCase().trim();
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.regNo.toLowerCase().includes(q) ||
        s.mobile.includes(q)
    );
  },

  /**
   * Get a student by ID
   */
  async getById(id) {
    const students = await this.getAll();
    return students.find((s) => s.id === id) || null;
  },

  /**
   * Accumulate lifetime stats for a student
   */
  async updateStats(studentId, addedWeight, addedAmount) {
    const students = await this.getAll();
    const index = students.findIndex((s) => s.id === studentId);
    if (index !== -1) {
      students[index].totalWeight = (students[index].totalWeight || 0) + addedWeight;
      students[index].totalAmountPaid = (students[index].totalAmountPaid || 0) + addedAmount;
      await AsyncStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
    }
  },
};

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
   * Save a new bill. Auto-generates billId and timestamp.
   */
  async save(billData) {
    const bills = await this.getAll();

    const newBill = {
      id: generateBillId(),
      studentId: billData.studentId,
      studentName: billData.studentName,
      regNo: billData.regNo,
      mobile: billData.mobile,
      weight: parseFloat(billData.weight),
      clothesCount: parseInt(billData.clothesCount, 10),
      serviceType: billData.serviceType,
      ratePerKg: billData.ratePerKg,
      totalAmount: billData.totalAmount,
      createdAt: Date.now(),
    };

    bills.push(newBill);
    await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(bills));
    return newBill;
  },

  /**
   * Search bills by regNo or date string
   */
  async search(query) {
    if (!query || query.trim().length === 0) {
      return this.getAll();
    }
    const bills = await this.getAll();
    const q = query.toLowerCase().trim();
    return bills.filter((b) => {
      const dateStr = new Date(b.createdAt).toLocaleDateString('en-IN');
      return (
        b.regNo.toLowerCase().includes(q) ||
        b.studentName.toLowerCase().includes(q) ||
        dateStr.includes(q) ||
        b.id.toLowerCase().includes(q)
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
   * Mark payment as done (Update student stats and delete the bill)
   */
  async markPaymentDone(billId) {
    const bills = await this.getAll();
    const billIndex = bills.findIndex((b) => b.id === billId);
    if (billIndex !== -1) {
      const bill = bills[billIndex];
      // 1. Update student stats
      await StudentService.updateStats(bill.studentId, bill.weight, bill.totalAmount);
      // 2. Remove bill from storage
      bills.splice(billIndex, 1);
      await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(bills));
    }
  },
};
