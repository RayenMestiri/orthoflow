import { TestBed } from '@angular/core/testing';
import { WaitlistForm } from './waitlist-form';

describe('WaitlistForm', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [WaitlistForm] }).compileComponents();
  });

  it('renders the required early-access fields', () => {
    const fixture = TestBed.createComponent(WaitlistForm);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('input[autocomplete="name"]')).toBeTruthy();
    expect(element.querySelector('input[autocomplete="organization"]')).toBeTruthy();
    expect(element.querySelector('input[type="email"]')).toBeTruthy();
    expect(element.querySelector('button[type="submit"]')?.textContent).toContain(
      'Request early access',
    );
  });
});
