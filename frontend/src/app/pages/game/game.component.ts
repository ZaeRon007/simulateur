import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HeaderComponent } from '../../components/header/header.component';
import { PhoneComponent } from '../../components/phone/phone.component';
import { RoadComponent } from '../../components/road/road.component';

@Component({
  selector: 'app-game',
  imports: [HeaderComponent, PhoneComponent, RoadComponent],
  templateUrl: './game.component.html',
  styleUrl: './game.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameComponent {}
