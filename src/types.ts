export interface Giveaway {
  id: string;
  title: string;
  maskedKey: string;
  puzzleHint: string;
  status: 'active' | 'claimed';
  platform: string;
  createdAt: number;
  winnerId: string | null;
}

export interface EligibilityResponse {
  eligible: boolean;
  skipRemaining: number;
}

export interface ClaimResponse {
  success: boolean;
  fullKey?: string;
  error?: string;
}
