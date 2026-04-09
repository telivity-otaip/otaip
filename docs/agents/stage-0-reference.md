# Stage 0 -- Reference Data Agents

**Package:** `@otaip/agents-reference`

Static reference data resolution: airport codes, airline codes, fare basis decoding, booking class mapping, equipment types, currency/tax codes, and country regulatory data.

---

### Agent 0.1 -- Airport/City Code Resolver

**ID:** `0.1`
**Class:** `AirportCodeResolver`
**Status:** Implemented

Resolves IATA/ICAO airport and city codes to canonical airport records with multi-airport city awareness, fuzzy name matching, and historical code handling.

**Input (`AirportCodeResolverInput`):**
- `code` -- IATA 3-letter, ICAO 4-letter, city code, or airport name
- `code_type?` -- `'iata' | 'icao' | 'city' | 'name' | 'auto'` (auto-detected if omitted)
- `include_metro?` -- return all airports in a metro/city code (default: true)
- `include_decommissioned?` -- resolve retired/reassigned codes (default: false)

**Output (`AirportCodeResolverOutput`):**
- `resolved_airport` -- canonical airport record (IATA, ICAO, name, city, country, timezone, lat/lon, type, status)
- `metro_airports` -- list of airports in the same metro area
- `match_confidence` -- 0-1 confidence score
- `stale_data?` -- true when dataset is older than 30 days
- `suggestion?` -- fuzzy match suggestion when code not found

**Example:**
```typescript
const agent = new AirportCodeResolver();
await agent.initialize();
const result = await agent.execute({ data: { code: 'JFK', code_type: 'iata' } });
// result.data.resolved_airport.name => "John F Kennedy International Airport"
```

---

### Agent 0.2 -- Airline Code & Alliance Mapper

**ID:** `0.2`
**Class:** `AirlineCodeMapper`
**Status:** Implemented

Resolves IATA/ICAO airline codes to canonical airline records with alliance membership and codeshare partner networks.

**Input (`AirlineCodeMapperInput`):**
- `code` -- IATA 2-letter, ICAO 3-letter, or airline name
- `code_type?` -- `'iata' | 'icao' | 'name' | 'auto'`
- `include_codeshares?` -- include codeshare partners (default: false)
- `include_defunct?` -- include ceased-operations airlines (default: false)

**Output (`AirlineCodeMapperOutput`):**
- `airline` -- canonical airline record (codes, name, callsign, country, alliance, hubs, status)
- `codeshare_partners` -- partner airline list with relationship type
- `match_confidence` -- 0-1 confidence score

**Example:**
```typescript
const agent = new AirlineCodeMapper();
await agent.initialize();
const result = await agent.execute({ data: { code: 'UA', include_codeshares: true } });
// result.data.airline.name => "United Airlines"
```

---

### Agent 0.3 -- Fare Basis Code Decoder

**ID:** `0.3`
**Class:** `FareBasisDecoder`
**Status:** Implemented

Decodes ATPCO-standard fare basis codes into human-readable components: cabin class, fare type, season, advance purchase, stay requirements, and penalties.

**Input (`FareBasisDecoderInput`):**
- `fare_basis` -- ATPCO fare basis code (max 15 chars, e.g., `"YOW3M1"`, `"TLXP14NR"`)
- `carrier?` -- IATA airline code for carrier-specific decoding

**Output (`FareBasisDecoderOutput`):**
- `decoded` -- parsed components (primary code, cabin class, fare type, season, day-of-week, advance purchase, min/max stay, penalties, ticket designator)
- `match_confidence` -- 1.0 = fully decoded, 0.5-0.9 = partial
- `unparsed_segments` -- parts that could not be decoded

**Example:**
```typescript
const agent = new FareBasisDecoder();
await agent.initialize();
const result = await agent.execute({ data: { fare_basis: 'Y26NR' } });
// result.data.decoded.cabin_class => "economy"
```

---

### Agent 0.4 -- Class of Service Mapper

**ID:** `0.4`
**Class:** `ClassOfServiceMapper`
**Status:** Implemented

Maps single-letter booking class codes to cabin class, fare family, upgrade eligibility, and loyalty program earning rates. Booking classes are carrier-specific.

**Input (`ClassOfServiceMapperInput`):**
- `booking_class` -- single letter A-Z
- `carrier` -- IATA 2-letter airline code (required -- meanings are carrier-specific)
- `include_loyalty?` -- include loyalty earning rates (default: false)

**Output (`ClassOfServiceMapperOutput`):**
- `mapping` -- cabin class, brand name, fare family, upgrade eligibility/type, same-day change, seat selection, refundable, priority level, loyalty earning
- `match_confidence` -- 1.0 = carrier-specific, 0.7 = IATA default, 0 = unknown

**Example:**
```typescript
const agent = new ClassOfServiceMapper();
await agent.initialize();
const result = await agent.execute({ data: { booking_class: 'J', carrier: 'UA', include_loyalty: true } });
// result.data.mapping.cabin_class => "business"
```

---

### Agent 0.5 -- Equipment Type Resolver

**ID:** `0.5`
**Class:** `EquipmentTypeResolver`
**Status:** Implemented

Resolves IATA aircraft equipment codes to structured equipment data including manufacturer, body type, typical seating, range, and max capacity.

**Input (`EquipmentTypeInput`):**
- `operation` -- `'resolve' | 'getSeatingConfig' | 'isWidebody' | 'getSimilarTypes'`
- `code` -- IATA equipment code (e.g., `"789"`, `"320"`)
- `cabin?` -- cabin code (`'F' | 'C' | 'W' | 'Y'`) for `getSeatingConfig`

**Output (`EquipmentTypeOutput`):**
- `equipment?` -- full equipment info (IATA/ICAO codes, manufacturer, family, body type, seats, range)
- `seatCount?` -- seat count for specific cabin
- `isWidebody?` -- boolean
- `similarTypes?` -- IATA codes of similar aircraft

**Example:**
```typescript
const agent = new EquipmentTypeResolver();
await agent.initialize();
const result = await agent.execute({ data: { operation: 'resolve', code: '789' } });
// result.data.equipment.manufacturer => "Boeing"
```

---

### Agent 0.6 -- Currency & Tax Code Resolver

**ID:** `0.6`
**Class:** `CurrencyTaxResolver`
**Status:** Implemented

Resolves ISO 4217 currency codes and IATA tax/surcharge codes used in airline pricing.

**Input (`CurrencyTaxResolverInput`):**
- `code` -- ISO currency code or IATA tax code
- `code_type?` -- `'currency' | 'tax' | 'auto'`
- `country?` -- ISO 2-letter country code to filter tax applicability

**Output (`CurrencyTaxResolverOutput`):**
- `currency` -- currency details (code, name, symbol, minor units, countries, active status)
- `tax` -- tax details (code, name, description, category, country, applies-to, percentage flag)
- `match_confidence` -- 0-1 confidence score

**Example:**
```typescript
const agent = new CurrencyTaxResolver();
await agent.initialize();
const result = await agent.execute({ data: { code: 'USD' } });
// result.data.currency.name => "US Dollar"
```

---

### Agent 0.7 -- Country Regulatory Resolver

**ID:** `0.7`
**Class:** `CountryRegulatoryResolver`
**Status:** Implemented

APIS requirements, visa requirements, and travel restriction levels. Static dataset -- must NOT be used as legal travel advice.

**Input (`CountryRegulatoryInput`):**
- `operation` -- `'getAPISRequirements' | 'getVisaRequirement' | 'getRestrictionLevel'`
- `countryCode?` -- ISO 2-letter (for APIS and restriction)
- `nationalityCode?` -- ISO 2-letter (for visa)
- `destinationCode?` -- ISO 2-letter (for visa)

**Output (`CountryRegulatoryOutput`):**
- `apis?` -- APIS requirements (required fields, advance submission hours)
- `visa?` -- visa requirement (type, max stay days)
- `restriction?` -- restriction level 1-4 with summary

**Example:**
```typescript
const agent = new CountryRegulatoryResolver();
await agent.initialize();
const result = await agent.execute({
  data: { operation: 'getVisaRequirement', nationalityCode: 'US', destinationCode: 'GB' }
});
// result.data.visa.requirement => "visa_free"
```
