import { ChangeDetectionStrategy, Component, output } from '@angular/core';

@Component({
  selector: 'app-conversations',
  imports: [],
  templateUrl: './conversations.component.html',
  styleUrl: './conversations.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConversationsComponent {
  readonly backClicked = output<void>();

  protected onBackClick(): void {
    this.backClicked.emit();
  }
}
