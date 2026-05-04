export interface UserProfileApi {
  nom: string;
  email: string;
  score: number;
  best_score: number;
}

export interface UserProfile {
  name: string;
  email: string;
  score: number;
  bestScore: number;
}

export interface ScoreRow {
  label: string;
  value: number;
}
