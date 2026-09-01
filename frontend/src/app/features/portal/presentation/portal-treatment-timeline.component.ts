import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TreatmentTimelineData {
  label: string;
  status: string;
  startDate: string | null;
  expectedEndDate: string | null;
  completionDate: string | null;
  retention?: {
    status: string;
    nextRecommendedControlAt: string | null;
  } | null;
}

@Component({
  selector: 'app-portal-treatment-timeline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="treatment-timeline">
      <div class="timeline-header">
        <div class="timeline-badge-group">
          <span class="timeline-icon-wrap">
            <span class="material-icons" aria-hidden="true">auto_graph</span>
          </span>
          <div>
            <h4 class="timeline-title">{{ data?.label || 'Traitement orthodontique' }}</h4>
            <p class="timeline-subtitle">Parcours de soins personnalisé</p>
          </div>
        </div>
        <span class="status-pill status-pill--{{ currentStatusClass() }}">
          {{ statusLabel() }}
        </span>
      </div>

      <div class="timeline-track">
        <div class="timeline-step" [class.completed]="isStepCompleted(1)" [class.active]="isStepActive(1)">
          <div class="step-marker">
            <span class="material-icons marker-icon">{{ isStepCompleted(1) ? 'check' : 'assignment' }}</span>
          </div>
          <div class="step-content">
            <span class="step-title">Diagnostic & Plan</span>
            <span class="step-date">{{ data?.startDate ? (data?.startDate | date: 'dd MMM yyyy') : 'Débuté' }}</span>
          </div>
        </div>

        <div class="timeline-connector" [class.filled]="isStepCompleted(1)"></div>

        <div class="timeline-step" [class.completed]="isStepCompleted(2)" [class.active]="isStepActive(2)">
          <div class="step-marker">
            <span class="material-icons marker-icon">{{ isStepCompleted(2) ? 'check' : 'flare' }}</span>
          </div>
          <div class="step-content">
            <span class="step-title">Traitement Actif</span>
            <span class="step-date">{{ isStepActive(2) ? 'Phase en cours' : (data?.expectedEndDate ? 'Est. ' + (data?.expectedEndDate | date: 'MMM yyyy') : 'Soins réguliers') }}</span>
          </div>
        </div>

        <div class="timeline-connector" [class.filled]="isStepCompleted(2)"></div>

        <div class="timeline-step" [class.completed]="isStepCompleted(3)" [class.active]="isStepActive(3)">
          <div class="step-marker">
            <span class="material-icons marker-icon">{{ isStepCompleted(3) ? 'check' : 'security' }}</span>
          </div>
          <div class="step-content">
            <span class="step-title">Contention</span>
            <span class="step-date">{{ data?.retention ? 'Stabilisation' : 'À venir' }}</span>
          </div>
        </div>

        <div class="timeline-connector" [class.filled]="isStepCompleted(3)"></div>

        <div class="timeline-step" [class.completed]="isStepCompleted(4)" [class.active]="isStepActive(4)">
          <div class="step-marker">
            <span class="material-icons marker-icon">{{ isStepCompleted(4) ? 'done_all' : 'task_alt' }}</span>
          </div>
          <div class="step-content">
            <span class="step-title">Finalisé</span>
            <span class="step-date">{{ data?.completionDate ? (data?.completionDate | date: 'dd MMM yyyy') : 'Sourire parfait' }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .treatment-timeline {
        padding: 24px;
        background: #fffefb;
        border-radius: 18px;
        border: 1px solid #dce2de;
        box-shadow: 0 8px 24px rgba(13, 41, 37, 0.04);
      }
      .timeline-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 28px;
      }
      .timeline-badge-group {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .timeline-icon-wrap {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: #e8efeb;
        color: #173f38;
        display: grid;
        place-items: center;
      }
      .timeline-title {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        color: #0d2925;
        letter-spacing: -0.02em;
      }
      .timeline-subtitle {
        margin: 2px 0 0;
        font-size: 13px;
        color: #56635f;
      }
      .status-pill {
        display: inline-flex;
        align-items: center;
        padding: 6px 14px;
        border-radius: 99px;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .status-pill--active {
        background: #e8efeb;
        color: #173f38;
        border: 1px solid rgba(23, 63, 56, 0.15);
      }
      .status-pill--completed {
        background: #edf7ed;
        color: #1e4620;
      }
      .status-pill--planned {
        background: #fbf5ea;
        color: #8c5b16;
      }
      .status-pill--default {
        background: #f6f3ec;
        color: #56635f;
      }

      .timeline-track {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        position: relative;
        gap: 8px;
      }
      .timeline-step {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        flex: 1;
        position: relative;
        z-index: 2;
      }
      .step-marker {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #f6f3ec;
        border: 2px solid #dce2de;
        color: #56635f;
        display: grid;
        place-items: center;
        margin-bottom: 10px;
        transition: all 0.25s ease;
      }
      .marker-icon {
        font-size: 20px;
      }
      .timeline-step.active .step-marker {
        background: #173f38;
        border-color: #173f38;
        color: #fffefb;
        box-shadow: 0 0 0 5px rgba(23, 63, 56, 0.15);
        transform: scale(1.05);
      }
      .timeline-step.completed .step-marker {
        background: #e8efeb;
        border-color: #173f38;
        color: #173f38;
      }
      .step-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .step-title {
        font-size: 13px;
        font-weight: 700;
        color: #17201e;
      }
      .timeline-step:not(.active):not(.completed) .step-title {
        color: #84918d;
      }
      .step-date {
        font-size: 11px;
        color: #56635f;
      }

      .timeline-connector {
        flex: 1;
        height: 3px;
        background: #dce2de;
        margin-top: 18px;
        position: relative;
        z-index: 1;
        border-radius: 2px;
        transition: background 0.25s ease;
      }
      .timeline-connector.filled {
        background: #173f38;
      }

      @media (max-width: 640px) {
        .timeline-track {
          flex-direction: column;
          align-items: stretch;
          gap: 20px;
        }
        .timeline-step {
          flex-direction: row;
          align-items: center;
          text-align: left;
          gap: 16px;
        }
        .step-marker {
          margin-bottom: 0;
          flex-shrink: 0;
        }
        .timeline-connector {
          display: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalTreatmentTimelineComponent {
  @Input() data: TreatmentTimelineData | null = null;

  protected isStepActive(step: number): boolean {
    const status = (this.data?.status || '').toUpperCase();
    if (this.data?.retention) return step === 3;
    if (status === 'COMPLETED') return step === 4;
    if (status === 'IN_PROGRESS' || status === 'ACTIVE') return step === 2;
    if (status === 'PLANNED') return step === 1;
    return step === 2;
  }

  protected isStepCompleted(step: number): boolean {
    const status = (this.data?.status || '').toUpperCase();
    if (status === 'COMPLETED') return step <= 4;
    if (this.data?.retention) return step <= 2;
    if (status === 'IN_PROGRESS' || status === 'ACTIVE') return step <= 1;
    return false;
  }

  protected currentStatusClass(): string {
    const s = (this.data?.status || '').toUpperCase();
    if (s === 'COMPLETED') return 'completed';
    if (s === 'IN_PROGRESS' || s === 'ACTIVE') return 'active';
    if (s === 'PLANNED') return 'planned';
    return 'default';
  }

  protected statusLabel(): string {
    if (this.data?.retention) return 'Phase de contention';
    const s = (this.data?.status || '').toUpperCase();
    if (s === 'COMPLETED') return 'Soins terminés';
    if (s === 'IN_PROGRESS' || s === 'ACTIVE') return 'Traitement actif';
    if (s === 'PLANNED') return 'Planifié';
    return 'Dossier de soins';
  }
}
