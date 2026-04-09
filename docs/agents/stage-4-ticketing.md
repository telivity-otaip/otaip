# Stage 4 -- Ticketing Agents

**Package:** `@otaip/agents-ticketing`

Electronic ticket issuance, EMD management, void processing, itinerary delivery, and document verification.

---

### Agent 4.1 -- Ticket Issuance

**ID:** `4.1`
**Class:** `TicketIssuance`
**Status:** Implemented

ETR (Electronic Ticket Record) generation with conjunction ticket support (auto-split for >4 coupons), BSP reporting fields, and commission handling.

**Input (`TicketIssuanceInput`):**
- `record_locator` -- 6-char PNR
- `issuing_carrier` -- 2-letter IATA code
- `passenger_name` -- LAST/FIRST format
- `segments` -- flight segments with carrier, flight number, class, fare basis, dates, baggage
- `base_fare`, `base_fare_currency` -- fare amount
- `equivalent_fare?`, `equivalent_fare_currency?` -- currency conversion
- `taxes` -- tax breakdown items
- `fare_calculation` -- fare calculation line
- `form_of_payment` -- CASH, CREDIT_CARD, INVOICE, MISCELLANEOUS
- `endorsements?`, `commission?`, `bsp_reporting?`, `original_issue?`

**Output (`TicketIssuanceOutput`):**
- `tickets` -- `TicketRecord[]` (13-digit number, coupons with status, fare/tax breakdown, FOP, commission, BSP fields)
- `total_coupons` -- total across all tickets
- `is_conjunction` -- whether conjunction tickets were generated

---

### Agent 4.2 -- EMD Management

**ID:** `4.2`
**Class:** `EmdManagement`
**Status:** Implemented

EMD-A (associated) and EMD-S (standalone) issuance with RFIC/RFISC handling and coupon lifecycle management.

**Input (`EmdManagementInput`):**
- `emd_type` -- `'EMD-A' | 'EMD-S'`
- `record_locator`, `issuing_carrier`, `passenger_name`
- `services` -- array of services with RFIC code (A-G), RFISC, description, amount, associated ticket/coupon for EMD-A
- `related_ticket_number?` -- for EMD-A

**Output (`EmdManagementOutput`):**
- `emd` -- `EmdRecord` (13-digit EMD number, coupons, amounts)
- `coupon_count`

---

### Agent 4.3 -- Void Agent

**ID:** `4.3`
**Class:** `VoidAgent`
**Status:** Implemented

Ticket/EMD void processing with coupon status validation, carrier-specific void window enforcement, and BSP/ARC cut-off time checking.

**Input (`VoidAgentInput`):**
- `document_number` -- 13-digit ticket/EMD number
- `issuing_carrier` -- 2-letter IATA code
- `coupons` -- coupon numbers and current statuses
- `issue_datetime` -- ISO datetime of issuance
- `current_datetime?` -- ISO datetime for void window check
- `settlement_system?` -- `'BSP' | 'ARC'`
- `bsp_cutoff_time?` -- HH:MM format

**Output (`VoidAgentOutput`):**
- `result` -- void permitted flag, rejection reason, message, void window hours, hours remaining, updated coupon statuses

---

### Agent 4.4 -- Itinerary Delivery

**ID:** `4.4`
**Class:** `ItineraryDelivery`
**Status:** Implemented

Multi-channel itinerary rendering: Email (HTML + plain text), SMS, and WhatsApp. Carrier-neutral templates.

**Input (`ItineraryDeliveryInput`):**
- `record_locator` -- booking reference
- `passengers` -- name, ticket number, frequent flyer
- `flights` -- flight details (number, origin, destination, times, cabin, seat, aircraft)
- `total_fare?`, `fare_currency?`
- `contact` -- email, phone, WhatsApp number
- `channels` -- `('EMAIL' | 'SMS' | 'WHATSAPP')[]`
- `agency_name?` -- for itinerary header

**Output (`ItineraryDeliveryOutput`):**
- `rendered` -- per-channel content (HTML/plain text, subject, SMS segment count)
- `channels_rendered` -- successfully rendered channels

---

### Agent 4.5 -- Document Verification

**ID:** `4.5`
**Class:** `DocumentVerification`
**Status:** Implemented

APIS validation, passport validity checking (configurable months threshold), and name matching between ticket and passport.

**Input (`DocumentVerificationInput`):**
- `passengers` -- ticket name, passport name, passport number/expiry/nationality, DOB, gender
- `segments` -- destination country and travel date
- `passport_validity_months?` -- minimum validity beyond travel date (default: 6)
- `validation_date?` -- ISO date override

**Output (`DocumentVerificationOutput`):**
- `results` -- per-passenger verification (pass/fail, individual checks with severity)
- `all_passed` -- overall pass/fail
- `blocking_failures`, `advisory_warnings` -- counts
