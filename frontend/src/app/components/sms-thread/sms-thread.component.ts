import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FamilyContact, SmsDistraction, SmsMessage } from '../../core/distraction.models';
import { DistractionService } from '../../core/distraction.service';

@Component({
  selector: 'app-sms-thread',
  templateUrl: './sms-thread.component.html',
  styleUrl: './sms-thread.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmsThreadComponent implements OnInit {
  readonly conversation = input.required<SmsDistraction>();
  readonly closed = output<void>();

  private readonly distractionService = inject(DistractionService);

  protected readonly contact = computed<FamilyContact>(() => this.conversation().contact);
  protected readonly messages = signal<SmsMessage[]>([]);
  protected readonly suggestedReplies = computed(() => this.conversation().suggestedReplies);
  protected readonly isWaitingReply = signal(false);
  protected readonly repliesDone = signal(false);

  ngOnInit(): void {
    this.messages.set([{ from: 'contact', text: this.conversation().message }]);
  }

  protected sendReply(reply: string): void {
    if (this.isWaitingReply() || this.repliesDone()) return;
    this.messages.update(msgs => [...msgs, { from: 'user', text: reply }]);
    this.isWaitingReply.set(true);
    this.distractionService.smsReplySent(this.contact().id);

    setTimeout(() => {
      const contactReplies = [
        'OK merci ! ❤️',
        'Super, bisous !',
        'Parfait 👍',
        'D\'accord, à tout à l\'heure !',
        'Merci mon chéri(e) 😘',
      ];
      const autoReply = contactReplies[Math.floor(Math.random() * contactReplies.length)];
      this.messages.update(msgs => [...msgs, { from: 'contact', text: autoReply }]);
      this.isWaitingReply.set(false);
      this.repliesDone.set(true);
    }, 2000);
  }
}
