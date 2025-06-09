# @ratebox/core-validator

Core validation logic for Rate Platform (shared by Importer, Validator, Extension...)

## Structure
- `src/` : Source TypeScript files
- `dist/`: Compiled output (after build)
- `index.ts`: Entry point for validator logic

## Usage
- Import and use in Importer, Validator, Extension, etc.
- Example:
  ```ts
  import { validateScamReport } from '@ratebox/core-validator';
  ```

## Scam Report Schema

Validator cung cấp schema chuẩn cho dữ liệu scammer:

```ts
import { scamReportSchema } from './src/scamReportSchema';

const result = scamReportSchema.safeParse(data);
if (!result.success) {
  // Xử lý lỗi validate
  console.log(result.error.issues);
} else {
  // Dữ liệu hợp lệ
  console.log(result.data);
}
```

## Scripts
- `npm run build` — Build TypeScript
- `npm test` — Run Jest tests

## Dependencies
- [zod](https://github.com/colinhacks/zod) — schema validation
- [jest](https://jestjs.io/) — testing

## Author
Rate Platform Team
