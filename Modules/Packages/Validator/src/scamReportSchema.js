"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scamReportSchema = void 0;
const zod_1 = require("zod");
exports.scamReportSchema = zod_1.z.object({
    phone: zod_1.z.string().min(8, 'Phone must be at least 8 digits').max(15, 'Phone too long'),
    name: zod_1.z.string().min(2, 'Name is required'),
    bank: zod_1.z.string().min(2, 'Bank is required'),
    amount: zod_1.z.number().min(1000, 'Amount must be at least 1,000'),
    content: zod_1.z.string().min(5, 'Content is required'),
    accountNumber: zod_1.z.string().optional(),
    category: zod_1.z.string().optional(),
    region: zod_1.z.string().optional(),
    trustScore: zod_1.z.number().min(0).max(100).optional(),
    createdAt: zod_1.z.string().datetime().optional(),
    updatedAt: zod_1.z.string().datetime().optional(),
});
