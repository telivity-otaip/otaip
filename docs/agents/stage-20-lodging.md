# Stage 20 -- Lodging Agents

**Package:** `@otaip/agents-lodging`

Hotel booking lifecycle: multi-source search aggregation, property deduplication, content normalization, rate comparison, booking execution, modification/cancellation, and CRS-PMS confirmation verification.

---

### Agent 20.1 -- Hotel Search Aggregator

**ID:** `20.1`
**Class:** `HotelSearchAggregatorAgent`
**Status:** Implemented

Multi-source hotel availability search across GDS hotel segments, direct APIs (Amadeus Hotel, Hotelbeds, Duffel Stays), and channel manager feeds. Returns raw, unmerged results from all connected sources. Supports injectable `HotelSourceAdapter` for plugging in custom sources.

**Input (`HotelSearchInput`):**
- `destination` -- city name, airport code, or coordinates
- `checkIn` -- ISO date string (YYYY-MM-DD)
- `checkOut` -- ISO date string (YYYY-MM-DD)
- `rooms` -- number of rooms needed
- `adults` -- number of adult guests per room
- `children?` -- number of child guests per room
- `starRating?` -- minimum star rating filter
- `maxRatePerNight?` -- maximum nightly rate filter (decimal string)
- `currency?` -- ISO 4217 currency for rate filtering/display
- `rateType?` -- rate type filter
- `chainPreference?` -- chain code (e.g., `"MC"` for Marriott)
- `timeoutMs?` -- per-adapter timeout in milliseconds (default: 5000)
- `adapterIds?` -- specific adapter IDs to query (all if omitted)

**Output (`HotelSearchOutput`):**
- `properties` -- raw hotel results from all sources (NOT deduplicated)
- `totalResults` -- total result count across all adapters
- `adapterResults` -- per-adapter summary (ID, name, count, response time, timeout/error)
- `partialResults` -- true if some adapters timed out or errored
- `searchId` -- unique search ID for tracing

**Example:**
```typescript
const agent = new HotelSearchAggregatorAgent();
await agent.initialize();
const result = await agent.execute({
  data: {
    destination: 'New York',
    checkIn: '2026-06-01',
    checkOut: '2026-06-03',
    rooms: 1,
    adults: 2,
  },
});
// result.data.totalResults => 45
// result.data.partialResults => false
```

---

### Agent 20.2 -- Property Deduplication

**ID:** `20.2`
**Class:** `PropertyDeduplicationAgent`
**Status:** Implemented

Takes raw multi-source hotel results from Agent 20.1 and identifies duplicate properties (40-60% of multi-source results are duplicates). Merges them into canonical property records using weighted scoring: Jaro-Winkler name similarity (0.3), normalized address Levenshtein (0.2), Haversine coordinate proximity (0.25), chain code match (0.15), and star rating match (0.1).

**Input (`DedupInput`):**
- `properties` -- raw hotel results from Agent 20.1
- `thresholds?` -- custom merge thresholds
  - `autoMerge` -- score above which properties are auto-merged (default: 0.85)
  - `review` -- score above which properties are flagged for review (default: 0.65)

**Output (`DedupOutput`):**
- `canonical` -- canonical property records (one per physical property)
- `mergeLog` -- full audit trail of merge/separate decisions (property IDs, score, decision type, score breakdown)
- `stats` -- summary (input count, output count, auto-merged, review-flagged, separated)

**Example:**
```typescript
const agent = new PropertyDeduplicationAgent();
await agent.initialize();
const result = await agent.execute({
  data: { properties: rawResults },
});
// result.data.stats.inputCount => 45
// result.data.stats.outputCount => 28
// result.data.stats.autoMerged => 12
```

---

### Agent 20.3 -- Hotel Content Normalization

**ID:** `20.3`
**Class:** `ContentNormalizationAgent`
**Status:** Implemented

Standardizes hotel content (room types, amenity names, photos) into a consistent OTAIP taxonomy for comparison and display. Maps raw room types from each source to the normalized taxonomy, merges amenities via union merge, and scores/categorizes photos.

**Input (`ContentNormInput`):**
- `properties` -- canonical property records from Agent 20.2

**Output (`ContentNormOutput`):**
- `properties` -- normalized property content records, each containing:
  - `canonicalId` -- pass-through from 20.2
  - `property` -- original canonical property
  - `normalizedRoomTypes` -- room types mapped to OTAIP taxonomy
  - `normalizedAmenities` -- amenities mapped to OTAIP taxonomy
  - `scoredPhotos` -- scored and categorized photos (category, quality score, primary flag)
  - `unmappedRoomTypes` -- raw room types that could not be normalized
  - `unmappedAmenities` -- raw amenity strings that could not be normalized
- `stats` -- totals for properties, mapped/unmapped room types, mapped/unmapped amenities

**Example:**
```typescript
const agent = new ContentNormalizationAgent();
await agent.initialize();
const result = await agent.execute({
  data: { properties: canonicalProperties },
});
// result.data.stats.totalRoomTypesMapped => 84
// result.data.stats.totalAmenitiesUnmapped => 3
```

---

### Agent 20.4 -- Hotel Rate Comparison

**ID:** `20.4`
**Class:** `RateComparisonAgent`
**Status:** Implemented

Compares rates for the same canonical property across all sources, identifies best available rate per rate type, and detects rate parity violations (>2% spread between lowest and highest source). Includes ALL mandatory fees (resort fees, destination fees, taxes) in total cost breakdown.

**Input (`RateCompInput`):**
- `properties` -- canonical properties with source results containing rates
- `currency?` -- preferred currency for display (default: USD)
- `nights?` -- number of nights for the stay (default: 1)

**Output (`RateCompOutput`):**
- `comparisons` -- per-property rate comparison, each containing:
  - `canonicalId` -- canonical property ID
  - `propertyName` -- property name
  - `rates` -- all rates sorted by total cost (lowest first), with full cost breakdown (room charges, mandatory fees, taxes, grand total)
  - `bestByRateType` -- best rate per rate type
  - `parity` -- rate parity analysis (at parity flag, lowest/highest source, spread percentage)
- `totalProperties` -- total properties compared
- `parityViolations` -- count of properties with rate parity violations

**Example:**
```typescript
const agent = new RateComparisonAgent();
await agent.initialize();
const result = await agent.execute({
  data: { properties: canonicalProperties, nights: 2 },
});
// result.data.comparisons[0].rates[0].totalCost.grandTotal => { amount: '289.00', currency: 'USD' }
// result.data.parityViolations => 3
```

---

### Agent 20.5 -- Hotel Booking

**ID:** `20.5`
**Class:** `HotelBookingAgent`
**Status:** Implemented

Executes hotel bookings through the optimal source. Manages the full booking flow from rate verification through confirmation, including three-layer confirmation codes (CRS, PMS, channel). Supports VCN (Virtual Card Number) payment with dual folio requirements.

**Input (`BookingInput`):**
- `operation` -- `'book' | 'verify_rate' | 'get_booking'`
- `bookingRequest?` -- required for `book`/`verify_rate`:
  - `canonicalPropertyId` -- from Agent 20.2
  - `rateId` -- from Agent 20.4
  - `source` -- hotel source to book through
  - `checkIn` / `checkOut` -- ISO date strings
  - `rooms` -- number of rooms
  - `guest` -- guest details (name, email, phone, loyalty info)
  - `paymentModel` -- payment model
  - `specialRequests?` -- free text
- `bookingId?` -- required for `get_booking`

**Output (`BookingOutput`):**
- `success` -- whether the operation succeeded
- `booking?` -- booking record (ID, three-layer confirmation codes, status, total charged, payment model, virtual card info, cancellation policy/deadline, guest, original request)
- `error?` -- error message if failed
- `rateChanged?` -- whether rate changed between search and booking
- `newRate?` -- new rate if changed

**Example:**
```typescript
const agent = new HotelBookingAgent();
await agent.initialize();
const result = await agent.execute({
  data: {
    operation: 'book',
    bookingRequest: {
      canonicalPropertyId: 'canon-001',
      rateId: 'rate-001',
      source: 'amadeus_hotel',
      checkIn: '2026-06-01',
      checkOut: '2026-06-03',
      rooms: 1,
      guest: { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
      paymentModel: 'merchant',
    },
  },
});
// result.data.booking?.confirmation.crs => "CRS-ABC123"
```

---

### Agent 20.6 -- Hotel Modification & Cancellation

**ID:** `20.6`
**Class:** `HotelModificationAgent`
**Status:** Implemented

Handles post-booking changes: free modifications (guest name, bed type, special requests), date changes (which require cancel/rebook -- NOT modifications), cancellations with penalty calculation, and no-show processing. Enforces California 24-hour cancellation rule where applicable.

**Input (`ModificationInput`):**
- `operation` -- `'modify' | 'cancel' | 'check_penalty' | 'process_no_show'`
- `bookingId` -- existing booking ID
- `modifications?` -- free modifications (guest name, bed type, smoking preference, special requests, accessibility needs, guest count)
- `dateChange?` -- new check-in / check-out dates (triggers cancel/rebook)
- `bookedAt?` -- booking timestamp for California 24hr rule check
- `cancellationPolicy?` -- current cancellation policy
- `checkInDate?` -- for deadline calculations
- `nightlyRate?` -- nightly rate from booking record (penalty base)

**Output (`ModificationOutput`):**
- `success` -- whether the operation succeeded
- `classification` -- `'free_modification' | 'cancel_rebook_required' | 'not_modifiable'`
- `isFreeMod` -- whether this is a free modification
- `penalty?` -- penalty calculation (amount, type, deadline, free window flag, California rule flag)
- `rebookRequired` -- whether a rebook is needed (for date changes)
- `newBookingId?` -- updated confirmation codes (for successful modifications)
- `message` -- error or status message

**Example:**
```typescript
const agent = new HotelModificationAgent();
await agent.initialize();
const result = await agent.execute({
  data: {
    operation: 'cancel',
    bookingId: 'BK-001',
    cancellationPolicy: { type: 'free_cancellation', deadline: '2026-05-30T00:00:00Z' },
    checkInDate: '2026-06-01',
    bookedAt: '2026-04-01T10:00:00Z',
  },
});
// result.data.classification => "free_modification"
// result.data.penalty?.isWithinFreeWindow => true
```

---

### Agent 20.7 -- Confirmation Verification

**ID:** `20.7`
**Class:** `ConfirmationVerificationAgent`
**Status:** Implemented

Cross-checks CRS and PMS booking data to detect discrepancies before guest arrival. Escalates missing PMS codes, waitlist/tentative status, rate/date mismatches. PMS sync can take 1-4 hours; delays beyond 24 hours trigger escalation.

**Input (`VerificationInput`):**
- `operation` -- `'verify' | 'check_pms_sync' | 'batch_verify'`
- `bookingId` -- booking ID to verify
- `confirmation` -- three-layer confirmation codes from booking
- `crsData` -- CRS-side booking data (confirmation code, guest name, dates, room type, rates, status)
- `pmsData?` -- PMS-side booking data (may be missing if PMS hasn't synced yet)
- `guest` -- guest details for name verification
- `hoursUntilCheckin?` -- hours until check-in (for escalation urgency)
- `batchBookingIds?` -- additional booking IDs (for `batch_verify`)

**Output (`VerificationOutput`):**
- `verified` -- whether verification passed with no critical issues
- `discrepancies` -- all detected discrepancies (field, CRS value, PMS value, severity, message)
- `escalationRequired` -- whether human/agent escalation is needed
- `escalationReasons` -- why escalation is needed (pms_code_missing, rate_mismatch, date_mismatch, guest_name_mismatch, waitlist_status, tentative_status, room_type_mismatch, multiple_discrepancies)
- `verifiedAt` -- verification timestamp
- `message` -- summary message

**Example:**
```typescript
const agent = new ConfirmationVerificationAgent();
await agent.initialize();
const result = await agent.execute({
  data: {
    operation: 'verify',
    bookingId: 'BK-001',
    confirmation: { crs: 'CRS-ABC', pms: 'PMS-123', channel: 'CH-456' },
    crsData: {
      confirmationCode: 'CRS-ABC',
      guestName: 'SMITH/JOHN',
      checkIn: '2026-06-01',
      checkOut: '2026-06-03',
      roomType: 'King Standard',
      nightlyRate: { amount: '189.00', currency: 'USD' },
      totalRate: { amount: '378.00', currency: 'USD' },
      status: 'confirmed',
    },
    guest: { firstName: 'John', lastName: 'Smith' },
  },
});
// result.data.verified => true
// result.data.discrepancies.length => 0
```
