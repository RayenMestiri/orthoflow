export interface ProblemItem {
  readonly number: string;
  readonly title: string;
  readonly description: string;
}

export interface CapabilityItem {
  readonly name: string;
  readonly summary: string;
  readonly detail: string;
  readonly tone: 'pine' | 'copper' | 'sage';
}

export const PROBLEMS: readonly ProblemItem[] = [
  {
    number: '01',
    title: 'The day changes faster than the schedule.',
    description:
      'Recurring controls, emergencies, and missed visits are difficult to coordinate across paper, calls, and chat threads.',
  },
  {
    number: '02',
    title: 'Treatment context gets scattered.',
    description:
      'Notes, photos, next steps, and patient history rarely live together when the team needs them.',
  },
  {
    number: '03',
    title: 'Cash history is hard to verify.',
    description:
      'A payment written in a notebook cannot reliably tell a parent who received it, when, or what balance remains.',
  },
];

export const CAPABILITIES: readonly CapabilityItem[] = [
  {
    name: 'Scheduling',
    summary: 'A clinic day everyone can read.',
    detail:
      'Coordinate recurring controls, chair time, reminders, arrivals, and waiting-list openings from one shared schedule.',
    tone: 'pine',
  },
  {
    name: 'Patients & treatments',
    summary: 'The full treatment story, in order.',
    detail:
      'Keep patient, guardian, clinical progress, documents, and the next action connected throughout treatment.',
    tone: 'sage',
  },
  {
    name: 'Cash records & receipts',
    summary: 'Every physical payment leaves a clear trail.',
    detail:
      'Record who paid, who received it, the linked treatment, receipt, and remaining balance—without processing money online.',
    tone: 'copper',
  },
  {
    name: 'Clinic operations',
    summary: 'Shared context with controlled access.',
    detail:
      'Give owners, doctors, assistants, and front-desk teams the right view of daily operations.',
    tone: 'sage',
  },
];

export const WORKFLOW: readonly string[] = [
  'Patient booked',
  'Reminder sent',
  'Patient arrived',
  'Treatment updated',
  'Cash recorded',
  'Parent informed',
  'Next visit scheduled',
];
