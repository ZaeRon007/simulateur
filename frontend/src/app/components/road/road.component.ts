import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-road',
  templateUrl: './road.component.html',
  styleUrl: './road.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoadComponent {}