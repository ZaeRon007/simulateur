import { Injectable, signal } from '@angular/core';
import {
  DistractionEvent,
  FamilyContact,
  SmsDistraction,
} from './distraction.models';

const FAMILY_CONTACTS: readonly FamilyContact[] = [
  { id: 'maman', name: 'Maman', relation: 'Mère', avatarColor: '#e91e8c', avatarInitials: 'M' },
  { id: 'papa', name: 'Papa', relation: 'Père', avatarColor: '#1565c0', avatarInitials: 'P' },
  { id: 'soeur', name: 'Léa', relation: 'Sœur', avatarColor: '#6a1b9a', avatarInitials: 'L' },
  { id: 'frere', name: 'Tom', relation: 'Frère', avatarColor: '#2e7d32', avatarInitials: 'T' },
  { id: 'mamie', name: 'Mamie', relation: 'Grand-mère', avatarColor: '#e65100', avatarInitials: 'G' },
];

const SMS_POOL: ReadonlyArray<Omit<SmsDistraction, 'type' | 'contact'>> = [
  { message: "T'es où là ? 😅", suggestedReplies: ["J'arrive dans 10min !", 'Sur la route', "Je t'appelle après"] },
  { message: "T'as pensé à ramener du pain ?", suggestedReplies: ["Oui c'est bon !", "Oups j'oublie pas", "J'en prends un"] },
  { message: 'Tu rentres à quelle heure ce soir ?', suggestedReplies: ['Vers 19h', 'Je sais pas encore', "Tard, ne m'attendez pas"] },
  { message: 'Appelle-moi quand tu peux ❤️', suggestedReplies: ["Je t'appelle dans 5min", "OK dès que j'ai le temps", "C'est urgent ?"] },
  { message: 'Tu veux quoi pour le dîner ?', suggestedReplies: ['N\'importe quoi 😊', 'Des pâtes !', 'Je mange dehors ce soir'] },
  { message: 'Regarde la photo que je t\'envoie 😂', suggestedReplies: ['Haha trop drôle 😂', "Qu'est-ce que c'est ?", "J'ai vu !"] },
  { message: 'N\'oublie pas, on se retrouve à 20h', suggestedReplies: ["C'est noté !", 'Je serai là', 'Peut-être un peu en retard'] },
];

const PHOTO_CAPTIONS = [
  "Regarde ce que j'ai fait aujourd'hui 📸",
  'Trop mignon non ? 😍',
  'Souvenir de famille 💕',
  'Tu te souviens de ça ? 😄',
];

const MUSIC_TRACKS: ReadonlyArray<{ trackName: string; artist: string }> = [
  { trackName: 'Ne me quitte pas', artist: 'Jacques Brel' },
  { trackName: 'La Vie en Rose', artist: 'Édith Piaf' },
  { trackName: 'Mistral Gagnant', artist: 'Renaud' },
  { trackName: 'Mon Vieux', artist: 'Daniel Guichard' },
];

const REMINDER_POOL: ReadonlyArray<{ text: string; confirmLabel: string; declineLabel: string }> = [
  { text: '🗓️ Dîner en famille ce soir — Tu viens ?', confirmLabel: "Oui, j'y serai !", declineLabel: 'Je ne peux pas' },
  { text: "🎂 C'est l'anniversaire de Mamie demain !", confirmLabel: "Je n'oublie pas", declineLabel: 'Rappelle-moi' },
  { text: '🏠 Réunion de famille dimanche — Présent ?', confirmLabel: 'Présent !', declineLabel: 'Je vois pas' },
];

const TIMEOUT_MS = 2500;
const TICK_MS = 50;

type DistractionWeight = { type: DistractionEvent['type']; weight: number };

const DISTRACTION_WEIGHTS: DistractionWeight[] = [
  { type: 'sms', weight: 40 },
  { type: 'call', weight: 25 },
  { type: 'notification' as DistractionEvent['type'], weight: 35 },
];

const NOTIFICATION_TYPES: Array<DistractionEvent['type']> = ['battery', 'photo', 'reminder', 'music', 'location'];

@Injectable({ providedIn: 'root' })
export class DistractionService {
  readonly currentDistraction = signal<DistractionEvent | null>(null);
  readonly smsConversations = signal<Map<string, SmsDistraction>>(new Map());
  readonly unreadSmsCount = signal(0);
  /** 0 = full time remaining, 100 = timed out */
  readonly countdownProgress = signal(0);
  readonly timedOut = signal(false);

  private scheduledTimeout: ReturnType<typeof setTimeout> | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private countdownStart = 0;
  private running = false;

  reset(): void {
    this.stop();
    this.currentDistraction.set(null);
    this.smsConversations.set(new Map());
    this.unreadSmsCount.set(0);
    this.countdownProgress.set(0);
    this.timedOut.set(false);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timedOut.set(false);
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    this.clearCountdown();
    if (this.scheduledTimeout !== null) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
    }
  }

  pauseCountdown(): void {
    this.clearCountdown();
  }

  resetCountdown(): void {
    if (this.countdownInterval !== null) {
      this.startCountdown();
    }
  }

  dismiss(): void {
    this.clearCountdown();
    this.currentDistraction.set(null);
    if (this.running) {
      this.scheduleNext();
    }
  }

  smsReplySent(contactId: string): void {
    this.clearCountdown();
    const convs = new Map(this.smsConversations());
    convs.delete(contactId);
    this.smsConversations.set(convs);
    if (this.running) {
      this.scheduleNext();
    }
  }

  markSmsRead(contactId: string): void {
    const convs = this.smsConversations();
    if (convs.has(contactId)) {
      this.unreadSmsCount.update(c => Math.max(0, c - 1));
    }
  }

  private scheduleNext(): void {
    if (this.scheduledTimeout !== null) return;
    const delayMs = (4 + Math.random() * 4) * 1000;
    this.scheduledTimeout = setTimeout(() => {
      this.scheduledTimeout = null;
      if (this.running) {
        this.triggerDistraction();
      }
    }, delayMs);
  }

  private triggerDistraction(): void {
    const event = this.generateEvent();
    if (event.type === 'sms') {
      this.addSmsConversation(event as SmsDistraction);
    } else {
      this.currentDistraction.set(event);
    }
    this.startCountdown();
  }

  private startCountdown(): void {
    this.clearCountdown();
    this.countdownStart = Date.now();
    this.countdownProgress.set(0);
    this.countdownInterval = setInterval(() => {
      const elapsed = Date.now() - this.countdownStart;
      const progress = Math.min(100, (elapsed / TIMEOUT_MS) * 100);
      this.countdownProgress.set(progress);
      if (progress >= 100) {
        this.clearCountdown();
        this.timedOut.set(true);
        this.stop();
      }
    }, TICK_MS);
  }

  private clearCountdown(): void {
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.countdownProgress.set(0);
  }

  private generateEvent(): DistractionEvent {
    const roll = Math.random() * 100;
    let cumulative = 0;
    let selectedType: string = 'sms';

    for (const { type, weight } of DISTRACTION_WEIGHTS) {
      cumulative += weight;
      if (roll < cumulative) {
        selectedType = type;
        break;
      }
    }

    if (selectedType === 'notification') {
      const notifType = NOTIFICATION_TYPES[Math.floor(Math.random() * NOTIFICATION_TYPES.length)];
      selectedType = notifType;
    }

    return this.buildEvent(selectedType as DistractionEvent['type']);
  }

  private buildEvent(type: DistractionEvent['type']): DistractionEvent {
    const contact = this.randomContact();

    switch (type) {
      case 'call':
        return { type: 'call', contact };

      case 'sms': {
        const pool = SMS_POOL[Math.floor(Math.random() * SMS_POOL.length)];
        return { type: 'sms', contact, ...pool };
      }

      case 'battery':
        return { type: 'battery', level: 1 };

      case 'photo': {
        const caption = PHOTO_CAPTIONS[Math.floor(Math.random() * PHOTO_CAPTIONS.length)];
        return { type: 'photo', contact, caption, photoCount: 2 + Math.floor(Math.random() * 4) };
      }

      case 'reminder': {
        const reminder = REMINDER_POOL[Math.floor(Math.random() * REMINDER_POOL.length)];
        return { type: 'reminder', ...reminder };
      }

      case 'music': {
        const track = MUSIC_TRACKS[Math.floor(Math.random() * MUSIC_TRACKS.length)];
        return { type: 'music', contact, ...track };
      }

      case 'location':
        return { type: 'location', contact };

      default:
        return { type: 'sms', contact, ...SMS_POOL[0] };
    }
  }

  private addSmsConversation(event: SmsDistraction): void {
    const convs = new Map(this.smsConversations());
    convs.set(event.contact.id, event);
    this.smsConversations.set(convs);
    this.unreadSmsCount.update(c => c + 1);
  }

  private randomContact(): FamilyContact {
    return FAMILY_CONTACTS[Math.floor(Math.random() * FAMILY_CONTACTS.length)];
  }
}
