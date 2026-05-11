import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SmsDistraction } from '../../core/distraction.models';
import { DistractionService } from '../../core/distraction.service';
import { SmsThreadComponent } from '../sms-thread/sms-thread.component';

@Component({
  selector: 'app-conversations',
  imports: [SmsThreadComponent],
  templateUrl: './conversations.component.html',
  styleUrl: './conversations.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConversationsComponent {
  private readonly distractionService = inject(DistractionService);

  protected readonly activeThread = signal<SmsDistraction | null>(null);

  protected readonly conversations = computed(() =>
    Array.from(this.distractionService.smsConversations().values())
  );

  protected openThread(conv: SmsDistraction): void {
    this.distractionService.markSmsRead(conv.contact.id);
    this.distractionService.resetCountdown();
    this.activeThread.set(conv);
  }

  protected closeThread(): void {
    this.activeThread.set(null);
  }
}
