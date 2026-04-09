/**
 * Queue Management Engine — Priority assignment, categorization, routing.
 *
 * Processes GDS queue entries and determines action + priority.
 */

import type {
  QueueEntry,
  QueueProcessingResult,
  QueueCommand,
  QueuePriority,
  QueueAction,
  QueueGdsSystem,
  QueueManagementInput,
  QueueManagementOutput,
} from './types.js';

function currentTime(input: QueueManagementInput): Date {
  return input.current_time ? new Date(input.current_time) : new Date();
}

// ---------------------------------------------------------------------------
// Priority assignment
// ---------------------------------------------------------------------------

function hoursUntilDeadline(deadline: string, now: Date): number {
  const dl = new Date(deadline);
  return (dl.getTime() - now.getTime()) / (1000 * 60 * 60);
}

function assignPriority(entry: QueueEntry, now: Date): QueuePriority {
  switch (entry.entry_type) {
    case 'TTL_DEADLINE': {
      if (!entry.deadline) return 'high';
      const hours = hoursUntilDeadline(entry.deadline, now);
      if (hours < 0) return 'urgent'; // already past deadline
      if (hours < 24) return 'urgent';
      if (hours < 72) return 'high';
      return 'normal';
    }
    case 'SCHEDULE_CHANGE':
      return 'high';
    case 'INVOLUNTARY_REBOOK':
      return 'urgent';
    case 'WAITLIST_CLEAR':
      return 'normal';
    case 'TICKET_REMINDER':
      return 'normal';
    case 'GENERAL':
      return 'low';
  }
}

// ---------------------------------------------------------------------------
// Action routing
// ---------------------------------------------------------------------------

function determineAction(
  entry: QueueEntry,
  priority: QueuePriority,
): { action: QueueAction; reason: string; target_agent?: string } {
  switch (entry.entry_type) {
    case 'TTL_DEADLINE':
      if (priority === 'urgent') {
        return {
          action: 'ROUTE_TO_TICKETING',
          reason: `TTL deadline ${entry.deadline ?? 'unknown'} — urgent ticketing required.`,
          target_agent: '3.3', // PNR Validation first, then ticketing
        };
      }
      return {
        action: 'ROUTE_TO_TICKETING',
        reason: `TTL deadline ${entry.deadline ?? 'unknown'} — ticketing within window.`,
        target_agent: '3.3',
      };

    case 'SCHEDULE_CHANGE':
      return {
        action: 'ROUTE_TO_SCHEDULE_CHANGE',
        reason: `Schedule change detected: ${entry.remark ?? 'details in PNR'}. Review and accept/reject.`,
        target_agent: '3.1', // GDS/NDC Router for rebooking
      };

    case 'WAITLIST_CLEAR':
      return {
        action: 'ROUTE_TO_WAITLIST',
        reason: `Waitlist cleared: ${entry.remark ?? 'segment confirmed'}. Verify and proceed to ticketing.`,
        target_agent: '3.3',
      };

    case 'INVOLUNTARY_REBOOK':
      return {
        action: 'ROUTE_TO_REISSUE',
        reason: `Involuntary change: ${entry.remark ?? 'rebooking needed'}. Protect passenger on alternative.`,
        target_agent: '3.1',
      };

    case 'TICKET_REMINDER':
      return {
        action: 'ROUTE_TO_TICKETING',
        reason: `Ticket reminder: ${entry.remark ?? 'follow up required'}.`,
        target_agent: '3.3',
      };

    case 'GENERAL':
      return {
        action: 'ROUTE_TO_MANUAL_REVIEW',
        reason: `General queue item: ${entry.remark ?? 'review needed'}.`,
      };
  }
}

// ---------------------------------------------------------------------------
// GDS queue commands
// ---------------------------------------------------------------------------

function buildQueueCommands(gds: QueueGdsSystem, queueNumber: number): QueueCommand[] {
  switch (gds) {
    case 'AMADEUS':
      return [
        { gds, command: `QR/${queueNumber}`, description: `Read queue ${queueNumber}` },
        { gds, command: `QD/${queueNumber}`, description: `Display queue ${queueNumber} count` },
        {
          gds,
          command: `QC/${queueNumber}`,
          description: `Clear current item from queue ${queueNumber}`,
        },
        { gds, command: `QN`, description: 'Move to next item in queue' },
        { gds, command: `QF`, description: 'Exit queue mode' },
      ];

    case 'SABRE':
      return [
        { gds, command: `Q/${queueNumber}`, description: `Access queue ${queueNumber}` },
        { gds, command: `QD/${queueNumber}`, description: `Display queue ${queueNumber} count` },
        { gds, command: `QR`, description: 'Remove current PNR from queue' },
        { gds, command: `QN`, description: 'Move to next item in queue' },
        { gds, command: `QP`, description: 'Exit queue mode' },
      ];

    case 'TRAVELPORT':
      // [NEEDS DOMAIN INPUT] Travelport queue commands vary by host system.
      // Using Galileo/Apollo conventions as default.
      return [
        { gds, command: `Q/${queueNumber}`, description: `Read queue ${queueNumber}` },
        { gds, command: `QC/${queueNumber}`, description: `Count items in queue ${queueNumber}` },
        { gds, command: `QXI`, description: 'Remove current item from queue' },
        { gds, command: `QN`, description: 'Move to next item in queue' },
        { gds, command: `QE`, description: 'Exit queue mode' },
      ];
  }
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

export function processQueue(input: QueueManagementInput): QueueManagementOutput {
  const now = currentTime(input);

  const results: QueueProcessingResult[] = input.entries.map((entry) => {
    const priority = assignPriority(entry, now);
    const { action, reason, target_agent } = determineAction(entry, priority);

    return {
      item_id: entry.item_id,
      record_locator: entry.record_locator,
      priority,
      status: 'pending' as const,
      action,
      reason,
      target_agent,
    };
  });

  // Sort by priority: urgent > high > normal > low
  const priorityOrder: Record<QueuePriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  results.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const summary = {
    total: results.length,
    urgent: results.filter((r) => r.priority === 'urgent').length,
    high: results.filter((r) => r.priority === 'high').length,
    normal: results.filter((r) => r.priority === 'normal').length,
    low: results.filter((r) => r.priority === 'low').length,
  };

  const commands =
    input.gds && input.queue_number != null
      ? buildQueueCommands(input.gds, input.queue_number)
      : undefined;

  return { results, commands, summary };
}
