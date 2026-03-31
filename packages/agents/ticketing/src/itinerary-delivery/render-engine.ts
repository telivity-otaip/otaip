/**
 * Itinerary Render Engine — multi-channel content generation.
 *
 * Carrier-neutral templates. No hardcoded airline branding.
 */

import type {
  ItineraryDeliveryInput,
  ItineraryDeliveryOutput,
  RenderedContent,
} from './types.js';

const SMS_SEGMENT_LENGTH = 160;

// ---------------------------------------------------------------------------
// Plain text builder (shared by SMS / WhatsApp / email alt body)
// ---------------------------------------------------------------------------

function buildPlainText(input: ItineraryDeliveryInput): string {
  const lines: string[] = [];

  if (input.agency_name) {
    lines.push(input.agency_name);
    lines.push('');
  }
  lines.push('ITINERARY CONFIRMATION');
  lines.push(`Booking Reference: ${input.record_locator}`);
  lines.push('');

  // Passengers
  lines.push('PASSENGERS:');
  for (const pax of input.passengers) {
    let paxLine = `  ${pax.name} — Ticket: ${pax.ticket_number}`;
    if (pax.frequent_flyer) paxLine += ` (FF: ${pax.frequent_flyer})`;
    lines.push(paxLine);
  }
  lines.push('');

  // Flights
  lines.push('FLIGHTS:');
  for (const f of input.flights) {
    lines.push(`  ${f.flight}  ${f.origin} → ${f.destination}`);
    let detail = `  ${f.departure_date}`;
    if (f.departure_time) detail += ` dep ${f.departure_time}`;
    if (f.arrival_time) detail += ` arr ${f.arrival_time}`;
    lines.push(detail);
    const extras: string[] = [];
    if (f.terminal) extras.push(`Terminal: ${f.terminal}`);
    if (f.cabin_class) extras.push(`Cabin: ${f.cabin_class}`);
    if (f.baggage_allowance) extras.push(`Baggage: ${f.baggage_allowance}`);
    if (f.seat) extras.push(`Seat: ${f.seat}`);
    if (extras.length > 0) lines.push(`  ${extras.join(' | ')}`);
    lines.push('');
  }

  // Fare
  if (input.total_fare) {
    lines.push(`TOTAL FARE: ${input.fare_currency ?? ''} ${input.total_fare}`);
    lines.push('');
  }

  lines.push('Please verify all details. Contact your travel agent for changes.');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function buildHtml(input: ItineraryDeliveryInput): string {
  const rows = input.flights.map((f) => {
    const extras: string[] = [];
    if (f.terminal) extras.push(`Terminal: ${f.terminal}`);
    if (f.baggage_allowance) extras.push(`Baggage: ${f.baggage_allowance}`);
    if (f.seat) extras.push(`Seat: ${f.seat}`);

    return `<tr>
<td>${f.flight}</td>
<td>${f.origin} → ${f.destination}</td>
<td>${f.departure_date}${f.departure_time ? ' ' + f.departure_time : ''}</td>
<td>${f.arrival_time ?? ''}</td>
<td>${f.cabin_class ?? f.booking_class}</td>
<td>${extras.join(', ')}</td>
</tr>`;
  }).join('\n');

  const paxList = input.passengers.map(
    (p) => `<li>${p.name} — Ticket: ${p.ticket_number}${p.frequent_flyer ? ` (FF: ${p.frequent_flyer})` : ''}</li>`,
  ).join('\n');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Itinerary Confirmation</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
<h1 style="color:#333;">${input.agency_name ? input.agency_name + ' — ' : ''}Itinerary Confirmation</h1>
<p><strong>Booking Reference:</strong> ${input.record_locator}</p>

<h2>Passengers</h2>
<ul>${paxList}</ul>

<h2>Flights</h2>
<table style="width:100%;border-collapse:collapse;">
<thead><tr style="background:#f0f0f0;">
<th style="padding:8px;text-align:left;">Flight</th>
<th style="padding:8px;text-align:left;">Route</th>
<th style="padding:8px;text-align:left;">Departure</th>
<th style="padding:8px;text-align:left;">Arrival</th>
<th style="padding:8px;text-align:left;">Cabin</th>
<th style="padding:8px;text-align:left;">Details</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>

${input.total_fare ? `<p style="margin-top:20px;"><strong>Total Fare:</strong> ${input.fare_currency ?? ''} ${input.total_fare}</p>` : ''}

<p style="color:#666;font-size:12px;margin-top:30px;">Please verify all details. Contact your travel agent for changes.</p>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// SMS builder (160-char segments)
// ---------------------------------------------------------------------------

function buildSms(input: ItineraryDeliveryInput): { content: string; segments: number } {
  const parts: string[] = [`Ref:${input.record_locator}`];

  for (const f of input.flights) {
    let line = `${f.flight} ${f.origin}-${f.destination} ${f.departure_date}`;
    if (f.departure_time) line += ` ${f.departure_time}`;
    parts.push(line);
  }

  const content = parts.join(' | ');
  const segments = Math.ceil(content.length / SMS_SEGMENT_LENGTH);

  return { content, segments };
}

// ---------------------------------------------------------------------------
// WhatsApp builder
// ---------------------------------------------------------------------------

function buildWhatsApp(input: ItineraryDeliveryInput): string {
  const lines: string[] = [];

  lines.push(`*${input.agency_name ? input.agency_name + ' — ' : ''}Itinerary Confirmation*`);
  lines.push(`Booking: *${input.record_locator}*`);
  lines.push('');

  for (const pax of input.passengers) {
    lines.push(`Passenger: ${pax.name}`);
    lines.push(`Ticket: ${pax.ticket_number}`);
  }
  lines.push('');

  for (const f of input.flights) {
    lines.push(`*${f.flight}* ${f.origin} → ${f.destination}`);
    let detail = `${f.departure_date}`;
    if (f.departure_time) detail += ` ${f.departure_time}`;
    if (f.arrival_time) detail += ` - ${f.arrival_time}`;
    lines.push(detail);
    if (f.baggage_allowance) lines.push(`Baggage: ${f.baggage_allowance}`);
    lines.push('');
  }

  if (input.total_fare) {
    lines.push(`Total: ${input.fare_currency ?? ''} ${input.total_fare}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderItinerary(input: ItineraryDeliveryInput): ItineraryDeliveryOutput {
  const rendered: RenderedContent[] = [];

  for (const channel of input.channels) {
    switch (channel) {
      case 'EMAIL': {
        const html = buildHtml(input);
        const plainText = buildPlainText(input);
        rendered.push({
          channel: 'EMAIL',
          content: html,
          plain_text: plainText,
          subject: `Itinerary Confirmation — ${input.record_locator}`,
        });
        break;
      }
      case 'SMS': {
        const { content, segments } = buildSms(input);
        rendered.push({
          channel: 'SMS',
          content,
          sms_segments: segments,
        });
        break;
      }
      case 'WHATSAPP': {
        const content = buildWhatsApp(input);
        rendered.push({
          channel: 'WHATSAPP',
          content,
        });
        break;
      }
    }
  }

  return {
    rendered,
    channels_rendered: rendered.map((r) => r.channel),
  };
}
