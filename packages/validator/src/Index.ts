import { scamReportSchema, baseSchema } from './ScamReportSchema';
import { SchemaValidator } from './validators/SchemaValidator';
import { BusinessValidator } from './validators/BusinessValidator';
import { EnrichmentValidator } from './validators/EnrichmentValidator';

export * from './ScamReportSchema';
export * from './validators/SchemaValidator';
export * from './validators/BusinessValidator';
export * from './validators/EnrichmentValidator';

// Main validation function
export async function validateScamReport(data: any, config?: ValidationConfig) {
  const validators = [
    new SchemaValidator(),
    new BusinessValidator(),
    new EnrichmentValidator()
  ];

  let result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    data: { ...data }
  };

  for (const validator of validators) {
    const validationResult = await validator.validate(result.data, config);
    
    result.errors.push(...validationResult.errors);
    result.warnings.push(...validationResult.warnings);
    result.data = validationResult.data;
    
    if (result.errors.length > 0 && config?.stopOnError) {
      result.isValid = false;
      break;
    }
  }

  result.isValid = result.errors.length === 0;
  return result;
}

// Types
export interface ValidationConfig {
  source?: 'checkscam' | 'extension' | 'manual' | 'import';
  stopOnError?: boolean;
  enrichData?: boolean;
  checkDuplicates?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  data: any;
}

export interface ValidationError {
  code: string;
  field: string;
  message: string;
  value?: any;
}

export interface ValidationWarning {
  code: string;
  field: string;
  message: string;
  value?: any;
}
