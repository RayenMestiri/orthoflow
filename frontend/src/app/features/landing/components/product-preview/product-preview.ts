import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-product-preview',
  templateUrl: './product-preview.html',
  styleUrl: './product-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductPreview {}
