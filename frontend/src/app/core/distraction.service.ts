import { Injectable, inject, signal } from '@angular/core';
import { AudioService } from './audio.service';
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
  { message: 'Tu veux quoi pour le dîner ?', suggestedReplies: ["N'importe quoi 😊", 'Des pâtes !', 'Je mange dehors ce soir'] },
  { message: "Regarde la photo que je t'envoie 😂", suggestedReplies: ['Haha trop drôle 😂', "Qu'est-ce que c'est ?", "J'ai vu !"] },
  { message: "N'oublie pas, on se retrouve à 20h", suggestedReplies: ["C'est noté !", 'Je serai là', 'Peut-être un peu en retard'] },
  { message: '🚨 RÉPONDS-MOI !!', suggestedReplies: ["Je suis en train de conduire !", "J'arrive !", 'Quoi ??'] },
  { message: "Pourquoi tu réponds pas ???", suggestedReplies: ['Désolé, je conduis', "Je t'appelle après", 'Une seconde !'] },
  { message: "C'est URGENT appelle-moi maintenant 😡", suggestedReplies: ["Je peux pas là !", "J'arrive !", 'Quoi ??'] },
  { message: "T'as vu mon message ? Réponds !!!", suggestedReplies: ["Oui, une seconde", "Je suis en route", 'Je t\'appelle'] },
  { message: "Allô ???? T'es vivant(e) ?! 😤", suggestedReplies: ['Oui je suis là !', 'Laisse-moi conduire !', "J'explique tout après"] },
  { message: "On t'attend tous ! Tu arrives quand ???", suggestedReplies: ['Dans 5 min !', 'Je suis presque là', 'Bientôt !'] },
  { message: "J'ai besoin de toi MAINTENANT 😭", suggestedReplies: ["Qu'est-ce qui se passe ?", "J'arrive !", 'Une minute !'] },
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
  { text: "⏰ RAPPEL URGENT : réponds aux messages !", confirmLabel: 'Je réponds !', declineLabel: 'Plus tard' },
  { text: "🔔 Tu as 5 messages non lus en attente !", confirmLabel: 'Je lis maintenant', declineLabel: 'Ignorer' },
  { text: "❗ Tout le monde te cherche — donne de tes nouvelles !", confirmLabel: "J'arrive !", declineLabel: 'Pas maintenant' },
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

@Injectable()
export class DistractionService {
  private readonly audioService = inject(AudioService);

  readonly currentDistraction = signal<DistractionEvent | null>(null);
  readonly smsConversations = signal<Map<string, SmsDistraction>>(new Map());
  readonly unreadSmsCount = signal(0);
  /** 0 = full time remaining, 100 = timed out */
  readonly countdownProgress = signal(0);
  readonly timedOut = signal(false);
  /** 0 = Classic (40% cascade), 1 = You Better Not Try (100% cascade) */
  readonly notificationProfile = signal(0);

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
    this.audioService.stopCallRingtone();
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
      this.scheduleNext(Math.random() < this.cascadeProb());
    }
  }

  smsReplySent(contactId: string): void {
    this.clearCountdown();
    const convs = new Map(this.smsConversations());
    convs.delete(contactId);
    this.smsConversations.set(convs);
    if (this.running) {
      this.scheduleNext(Math.random() < this.cascadeProb());
    }
  }

  private cascadeProb(): number {
    return 0.4 + this.notificationProfile() * 0.6;
  }

  markSmsRead(contactId: string): void {
    const convs = this.smsConversations();
    if (convs.has(contactId)) {
      this.unreadSmsCount.update(c => Math.max(0, c - 1));
    }
  }

  private scheduleNext(forceShort = false): void {
    if (this.scheduledTimeout !== null) return;
    const delayMs = forceShort ? (0.5 + Math.random() * 1) * 1000 : (1.5 + Math.random() * 2.5) * 1000;
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
      this.audioService.playSmsNotification();
    } else {
      this.currentDistraction.set(event);
      if (event.type === 'call') {
        this.audioService.playCallRingtone();
      } else {
        this.audioService.playGeneralNotification();
      }
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
        this.clearCountdown(false);
      }
    }, TICK_MS);
  }

  private clearCountdown(resetProgress = true): void {
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (resetProgress) {
      this.countdownProgress.set(0);
    }
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
        return { type: 'battery', level: Math.random() < 0.6 ? 1 : 5 };

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
