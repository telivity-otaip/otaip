# Adding a New Supplier

1. **Copy this directory** to `suppliers/<your-supplier>/`
2. **Rename** `TemplateAdapter` → `YourSupplierAdapter`, update `supplierId` and `supplierName`
3. **Create types.ts** — define the raw request/response types for your supplier's API
4. **Create config.ts** — define config interface + Zod validation schema
5. **Create mapper.ts** — implement request/response mapping to the standard interface
6. **Implement** each method in your adapter class
7. **Register** your supplier in `suppliers/index.ts`:
   ```typescript
   registerSupplier('your-supplier', (config) => new YourSupplierAdapter(config));
   ```
8. **Add tests** in `__tests__/` — cover mappers, date formatting, money handling
9. **Export** from the barrel `src/index.ts`

## Key Rules

- Money amounts: always `decimal.js` strings, never floats
- Payment type: always `HOLD` unless your supplier requires otherwise (and document why)
- Date formats: check your supplier's API docs for expected formats
- Config: use constructor injection, never hardcode credentials
