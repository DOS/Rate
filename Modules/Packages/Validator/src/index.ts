import { scamReportSchema } from './scamReportSchema';

export function validateScamReport(data: any) {
  const result = scamReportSchema.safeParse(data);
  if (!result.success) {
    return {
      valid: false,
      error: result.error.issues.map(i => i.message).join(', '),
      issues: result.error.issues
    };
  }
  return { valid: true, data: result.data };
}
