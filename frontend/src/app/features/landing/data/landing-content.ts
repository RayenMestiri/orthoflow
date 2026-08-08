export interface ProblemItem {
  readonly number: string;
  readonly context: string;
  readonly title: string;
  readonly description: string;
  readonly impact: string;
}

export interface CapabilityItem {
  readonly name: string;
  readonly summary: string;
  readonly detail: string;
  readonly tone: 'pine' | 'copper' | 'sage';
}

export interface WorkflowPhase {
  readonly number: string;
  readonly title: string;
  readonly owner: string;
  readonly steps: readonly WorkflowStep[];
}

export interface WorkflowStep {
  readonly label: string;
  readonly actor: string;
  readonly emphasis?: boolean;
}

export const PROBLEMS: readonly ProblemItem[] = [
  {
    number: '01',
    context: 'The schedule',
    title: 'The day changes faster than the schedule.',
    description:
      'Recurring controls, emergencies, and missed visits are difficult to coordinate across paper, calls, and chat threads.',
    impact: 'Chair time is lost',
  },
  {
    number: '02',
    context: 'The clinical handoff',
    title: 'Treatment context gets scattered.',
    description:
      'Notes, photos, next steps, and patient history rarely live together when the team needs them.',
    impact: 'Decisions lose context',
  },
  {
    number: '03',
    context: 'The financial record',
    title: 'Cash history is hard to verify.',
    description:
      'A payment written in a notebook cannot reliably tell a parent who received it, when, or what balance remains.',
    impact: 'Trust becomes manual',
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

export const WORKFLOW_PHASES: readonly WorkflowPhase[] = [
  {
    number: '01',
    title: 'Prepare',
    owner: 'Front desk + reminders',
    steps: [
      { label: 'Patient booked', actor: 'Front desk' },
      { label: 'Reminder sent', actor: 'Automated' },
    ],
  },
  {
    number: '02',
    title: 'In the clinic',
    owner: 'Clinical team',
    steps: [
      { label: 'Patient arrived', actor: 'Front desk' },
      { label: 'Treatment updated', actor: 'Orthodontist' },
      { label: 'Cash recorded', actor: 'Front desk', emphasis: true },
    ],
  },
  {
    number: '03',
    title: 'Close the loop',
    owner: 'Practice + guardian',
    steps: [
      { label: 'Parent informed', actor: 'Parent portal' },
      { label: 'Next visit scheduled', actor: 'Front desk' },
    ],
  },
];
