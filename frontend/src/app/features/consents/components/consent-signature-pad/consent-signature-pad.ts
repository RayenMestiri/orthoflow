import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  output,
  signal,
} from '@angular/core';
import SignaturePad from 'signature_pad';

@Component({
  selector: 'app-consent-signature-pad',
  templateUrl: './consent-signature-pad.html',
  styleUrl: './consent-signature-pad.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentSignaturePad implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;
  readonly hasInk = signal(false);
  readonly inkChange = output<boolean>();
  private pad?: SignaturePad;
  private observer?: ResizeObserver;

  ngAfterViewInit(): void {
    this.pad = new SignaturePad(this.canvasRef.nativeElement, {
      minWidth: 0.8,
      maxWidth: 2.2,
      penColor: '#18324a',
      throttle: 12,
    });
    this.pad.addEventListener('endStroke', this.onStrokeEnd);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.canvasRef.nativeElement.parentElement!);
    this.resize();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.pad?.removeEventListener('endStroke', this.onStrokeEnd);
    this.pad?.off();
  }

  clear(): void {
    this.pad?.clear();
    this.setInk(false);
  }

  async exportFile(): Promise<File | null> {
    if (!this.pad || this.pad.isEmpty()) return null;
    const blob = await new Promise<Blob | null>((resolve) =>
      this.canvasRef.nativeElement.toBlob(resolve, 'image/png'),
    );
    return blob ? new File([blob], 'consent-signature.png', { type: 'image/png' }) : null;
  }

  private readonly onStrokeEnd = (): void => this.setInk(!(this.pad?.isEmpty() ?? true));

  private resize(): void {
    if (!this.pad) return;
    const canvas = this.canvasRef.nativeElement;
    const points = this.pad.toData();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.parentElement?.clientWidth ?? canvas.clientWidth;
    const height = canvas.parentElement?.clientHeight ?? 210;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.getContext('2d')?.scale(ratio, ratio);
    this.pad.clear();
    if (points.length) this.pad.fromData(points);
    this.setInk(points.length > 0);
  }

  private setInk(value: boolean): void {
    this.hasInk.set(value);
    this.inkChange.emit(value);
  }
}
