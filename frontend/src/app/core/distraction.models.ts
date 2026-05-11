export interface FamilyContact {
  readonly id: string;
  readonly name: string;
  readonly relation: string;
  readonly avatarColor: string;
  readonly avatarInitials: string;
}

export interface SmsMessage {
  readonly from: 'contact' | 'user';
  readonly text: string;
}

export interface CallDistraction {
  readonly type: 'call';
  readonly contact: FamilyContact;
}

export interface SmsDistraction {
  readonly type: 'sms';
  readonly contact: FamilyContact;
  readonly message: string;
  readonly suggestedReplies: readonly string[];
}

export interface BatteryDistraction {
  readonly type: 'battery';
  readonly level: number;
}

export interface PhotoDistraction {
  readonly type: 'photo';
  readonly contact: FamilyContact;
  readonly caption: string;
  readonly photoCount: number;
}

export interface ReminderDistraction {
  readonly type: 'reminder';
  readonly text: string;
  readonly confirmLabel: string;
  readonly declineLabel: string;
}

export interface MusicDistraction {
  readonly type: 'music';
  readonly contact: FamilyContact;
  readonly trackName: string;
  readonly artist: string;
}

export interface LocationDistraction {
  readonly type: 'location';
  readonly contact: FamilyContact;
}

export type DistractionEvent =
  | CallDistraction
  | SmsDistraction
  | BatteryDistraction
  | PhotoDistraction
  | ReminderDistraction
  | MusicDistraction
  | LocationDistraction;
