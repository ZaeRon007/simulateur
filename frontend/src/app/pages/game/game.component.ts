import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { HeaderComponent } from '../../components/header/header.component';
import { PhoneComponent } from '../../components/phone/phone.component';
import { RoadComponent } from '../../components/road/road.component';

@Component({
  selector: 'app-game',
  imports: [DecimalPipe, HeaderComponent, PhoneComponent, RoadComponent],
  templateUrl: './game.component.html',
  styleUrl: './game.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown.ArrowUp)': 'keyUpPressed.set(true)',
    '(window:keyup.ArrowUp)': 'keyUpPressed.set(false)',
    '(window:keydown.ArrowDown)': 'keyDownPressed.set(true)',
    '(window:keyup.ArrowDown)': 'keyDownPressed.set(false)',
  }
})
export class GameComponent {
  protected readonly isStarted = signal(false);
  protected readonly distanceMeters = signal(0);
  protected readonly keyUpPressed = signal(false);
  protected readonly keyDownPressed = signal(false);

  protected startGame(): void {
    this.isStarted.set(true);
  }
}
