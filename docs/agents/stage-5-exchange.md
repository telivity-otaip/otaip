# Stage 5 -- Exchange & Change Agents

**Package:** `@otaip/agents-exchange`

Voluntary change assessment, ticket reissue, involuntary rebook, and (coming soon) disruption response, self-service rebooking, and waitlist management.

---

### Agent 5.1 -- Change Management

**ID:** `5.1`
**Class:** `ChangeManagement`
**Status:** Implemented

ATPCO Category 31 voluntary change assessment: change fees, fare difference, residual value, waiver codes, 24-hour free change window detection.

**Input (`ChangeManagementInput`):**
- `original_ticket` -- ticket number, issuing carrier, passenger name, record locator, issue date, base fare, total tax, fare basis, refundable flag, booking date
- `requested_itinerary` -- new segments (carrier, flight, origin, destination, date, class, fare basis), new fare, new taxes
- `waiver_code?` -- airline-provided waiver code
- `current_datetime?` -- ISO datetime

**Output (`ChangeManagementOutput`):**
- `assessment` -- action (`REISSUE | REBOOK | REJECT`), change fee, fare difference, additional collection, residual value, forfeited amount, tax difference, total due, free change flag, summary

---

### Agent 5.2 -- Exchange/Reissue

**ID:** `5.2`
**Class:** `ExchangeReissue`
**Status:** Implemented

Ticket reissue with residual value application, tax carryforward, conjunction ticket handling, GDS exchange command generation, and full audit trail.

**Input (`ExchangeReissueInput`):**
- `original_ticket_number`, `conjunction_originals?`, `original_issue_date`
- `issuing_carrier`, `passenger_name`, `record_locator`
- `original_base_fare`, `original_taxes` -- from original ticket
- `change_fee`, `residual_value`, `waiver_code?` -- from Agent 5.1
- `new_segments` -- new flight segments
- `new_fare`, `new_fare_currency`, `new_taxes`, `fare_calculation`
- `form_of_payment` -- for additional collection
- `gds?` -- GDS for command generation
- `same_origin_destination` -- for tax carryforward eligibility

**Output (`ExchangeReissueOutput`):**
- `reissue` -- new ticket record with full audit trail, exchange commands, tax carryforward details
- `additional_collection` -- amount due
- `credit_amount` -- amount refundable if downgrade

---

### Agent 5.3 -- Involuntary Rebook

**ID:** `5.3`
**Class:** `InvoluntaryRebook`
**Status:** Implemented

Carrier-initiated schedule change handling: trigger assessment (time change, routing change, equipment downgrade, cancellation), airline protection logic (same carrier > alliance > interline), and regulatory entitlement flags (EU261, US DOT).

**Input (`InvoluntaryRebookInput`):**
- `original_pnr` -- record locator, passenger, affected segment, issuing carrier, countries, checked-in flag, EU carrier flag
- `schedule_change` -- change type, original/new times, time change minutes, routing changes, equipment changes
- `available_flights?` -- protection flight options with carrier/alliance/interline flags
- `thresholds?` -- override involuntary trigger thresholds
- `is_passenger_no_show?` -- no-show flag

**Output (`InvoluntaryRebookOutput`):**
- `result` -- involuntary flag, trigger type, protection options (ordered by priority), protection path taken, regulatory flags (EU261/US DOT applicability), original routing credit flag, summary

---

### Agent 5.4 -- Disruption Response

**ID:** `5.4`
**Class:** `DisruptionResponseAgent`
**Status:** Coming Soon (stub)

Requires domain input on disruption priority rules and carrier-specific response procedures.

---

### Agent 5.5 -- Self-Service Rebooking

**ID:** `5.5`
**Class:** `SelfServiceRebookingAgent`
**Status:** Coming Soon (stub)

Requires domain input on change fee structures, fare ineligibility rules, and self-service rebooking policy.

---

### Agent 5.6 -- Waitlist Management

**ID:** `5.6`
**Class:** `WaitlistManagementAgent`
**Status:** Coming Soon (stub)

Requires domain input on waitlist priority scoring and clearance procedures.
