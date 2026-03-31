/**
 * OTAIP Direct Booking Demo
 *
 * Runs the full search -> evaluate -> price -> book flow against
 * the live Duffel sandbox without requiring an LLM API key.
 *
 * The decision logic (pick the best flight for the traveler's context)
 * is coded directly. When Claude API access is available, use
 * book-flight.ts instead for the full LLM-powered agent experience.
 *
 * Flow: Decision logic -> OTAIP DuffelAdapter -> Duffel sandbox API
 *
 * Requires .env at repo root:
 *   DUFFEL_API_KEY=duffel_test_...
 *
 * Run: pnpm --filter @otaip/demo book:direct
 */

import { DuffelAdapter } from '../packages/adapters/duffel/src/duffel-adapter.ts';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const adapter = new DuffelAdapter();

async function run() {
  const twoWeeksOut = new Date();
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);
  const departureDate = twoWeeksOut.toISOString().split('T')[0]!;

  console.log('='.repeat(60));
  console.log('OTAIP Direct Booking Demo');
  console.log('='.repeat(60));
  console.log(`\nScenario: Business traveler needs LHR -> AMS on ${departureDate}`);
  console.log('Constraint: Must land by 10:15 AM (11:00 meeting, 45min buffer)');
  console.log('Preference: Direct flights, economy, time > cost\n');

  // Step 1: Search
  console.log('--- Step 1: Search flights ---');
  const searchResult = await adapter.search({
    segments: [{ origin: 'LHR', destination: 'AMS', departure_date: departureDate }],
    passengers: [{ type: 'ADT', count: 1 }],
    cabin_class: 'economy',
  });

  console.log(`Found ${searchResult.offers.length} offers\n`);

  if (searchResult.offers.length === 0) {
    console.log('No offers found. The Duffel sandbox may not have flights for this route/date.');
    console.log('Try a different date or route (e.g., LHR-CDG, LHR-BCN).');
    process.exit(0);
  }

  // Step 2: Evaluate all options
  console.log('--- Step 2: Evaluate options ---');
  const scored = searchResult.offers.map((offer) => {
    const seg = offer.itinerary.segments[0]!;
    const arrivalTime = new Date(seg.arrival_time);
    const arrivalHour = arrivalTime.getHours() + arrivalTime.getMinutes() / 60;

    // Amsterdam is CET/CEST - arrival times from Duffel are local
    const meetingDeadline = 10.25; // 10:15 AM latest arrival
    const arrivesOnTime = arrivalHour <= meetingDeadline;
    const isDirect = offer.itinerary.connection_count === 0;
    const duration = offer.itinerary.total_duration_minutes;
    const price = offer.price.total;

    // Score: higher is better
    let score = 0;
    if (arrivesOnTime) score += 100; // Must-have
    if (isDirect) score += 50; // Strong preference
    score -= duration * 0.1; // Shorter is better
    score -= price * 0.01; // Cheaper is slightly better (but less important)

    const flight = `${seg.carrier}${seg.flight_number}`;
    const departs = seg.departure_time.slice(11, 16);
    const arrives = seg.arrival_time.slice(11, 16);

    console.log(
      `  ${flight} | ${departs} -> ${arrives} | ` +
      `${duration}min | ${isDirect ? 'Direct' : offer.itinerary.connection_count + ' stop'} | ` +
      `${price} ${offer.price.currency} | ` +
      `${arrivesOnTime ? 'On time' : 'TOO LATE'} | ` +
      `Score: ${score.toFixed(1)}`,
    );

    return { offer, score, flight, departs, arrives, arrivesOnTime, isDirect, duration, price };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]!;

  console.log(`\nBest option: ${best.flight} departing ${best.departs}, arriving ${best.arrives}`);
  console.log(`Reason: ${best.arrivesOnTime ? 'Arrives before meeting deadline' : 'Best available'}, ${best.isDirect ? 'direct flight' : 'connecting'}, ${best.duration}min, ${best.price} ${best.offer.price.currency}\n`);

  // Step 3: Price confirmation
  console.log('--- Step 3: Confirm pricing ---');
  const priceResult = await adapter.price!({
    offer_id: best.offer.offer_id,
    source: 'duffel',
    passengers: [{ type: 'ADT', count: 1 }],
  });

  if (!priceResult.available) {
    console.log('Offer no longer available. In production, would fall back to next best option.');
    process.exit(1);
  }

  console.log(`Price confirmed: ${priceResult.price.total} ${priceResult.price.currency}`);
  console.log(`Expires: ${priceResult.expires_at ?? 'unknown'}\n`);

  // Step 4: Book
  console.log('--- Step 4: Create booking ---');
  const bookResult = await adapter.book({
    offer_id: best.offer.offer_id,
    passengers: [{
      title: 'mr',
      given_name: 'John',
      family_name: 'Test',
      born_on: '1985-06-15',
      email: 'john.test@example.com',
      phone_number: '+442080160509',
      gender: 'm',
      type: 'adult',
    }],
  });

  console.log('\n' + '='.repeat(60));
  console.log(`BOOKING CONFIRMED`);
  console.log('='.repeat(60));
  console.log(`Reference: ${bookResult.booking_reference}`);
  console.log(`Order ID:  ${bookResult.order_id}`);
  console.log(`Flight:    ${best.flight} | LHR -> AMS | ${best.departs} -> ${best.arrives}`);
  console.log(`Passenger: Mr. John Test | Economy`);
  console.log(`Total:     ${bookResult.total_amount} ${bookResult.total_currency}`);
  console.log('='.repeat(60));

  // Explain decision
  const onTimeOptions = scored.filter((s) => s.arrivesOnTime);
  const lateOptions = scored.filter((s) => !s.arrivesOnTime);
  console.log(`\nWhy this flight:`);
  console.log(`  ${scored.length} options evaluated. ${onTimeOptions.length} arrive before 10:15 AM.`);
  if (lateOptions.length > 0) {
    console.log(`  ${lateOptions.length} rejected (arrive after meeting deadline): ${lateOptions.map((s) => `${s.flight} at ${s.arrives}`).join(', ')}`);
  }
  if (onTimeOptions.length > 1) {
    const others = onTimeOptions.filter((s) => s !== best);
    console.log(`  Other viable options: ${others.map((s) => `${s.flight} at ${s.arrives} (${s.price} ${s.offer.price.currency})`).join(', ')}`);
    console.log(`  ${best.flight} chosen for best balance of arrival time, duration, and cost.`);
  }

  console.log('\nDemo complete.');
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
