import { z } from 'zod';
import { scamReportSchema } from '../ScamReportSchema';
import { ValidationConfig, ValidationResult, ValidationError } from '../Index';

export class SchemaValidator {
  async validate(data: any, config?: ValidationConfig): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      data: { ...data }
    };

    try {
      const parseResult = scamReportSchema.safeParse(data);
      
      if (!parseResult.success) {
        parseResult.error.issues.forEach(issue => {
          result.errors.push({
            code: 'SCHEMA_VALIDATION_ERROR',
            field: issue.path.join('.'),
            message: issue.message,
            value: data[issue.path[0]]
          });
        });
        result.isValid = false;
      } else {
        result.data = parseResult.data;
      }
    } catch (error) {
      result.errors.push({
        code: 'SCHEMA_VALIDATION_FAILED',
        field: 'root',
        message: error instanceof Error ? error.message : 'Unknown validation error'
      });
      result.isValid = false;
    }

    return result;
  }
} 