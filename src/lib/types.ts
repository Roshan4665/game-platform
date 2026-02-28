export type GameType = "word-guesser" | "yes-no";
export type HintSource = "llm" | "player";
export type RoomStatus = "waiting" | "playing" | "finished";
export type RoundPhase = "picking-word" | "guessing" | "round-result";

export interface Player {
  id: string;
  name: string;
  joinedAt: number;
}

export interface Hint {
  text: string;
  source: HintSource;
  timestamp: number;
}

export interface YesNoQuestion {
  question: string;
  answer?: "yes" | "no";
  answeredBy?: HintSource;
  timestamp: number;
}

export interface Round {
  roundNumber: number;
  pickerId: string;       // who picks the word
  guesserId: string;      // who guesses
  word?: string;
  hintSource: HintSource; // who provides hints/answers
  hints?: Record<string, Hint>;           // for word-guesser
  questions?: Record<string, YesNoQuestion>; // for yes-no
  guesses?: Record<string, { text: string; timestamp: number }>; // all guesses
  revealedIndices?: number[]; // indices of revealed letters
  isCorrect?: boolean;
  gaveUp?: boolean;
  phase: RoundPhase;
  roundPoints: number;    // starts at 100, decreases with hints/wrong guesses
}

export interface GameRoom {
  id: string;
  gameType: GameType;
  status: RoomStatus;
  totalRounds: number;
  currentRound: number;
  players: Record<string, Player>;
  rounds: Record<string, Round>;
  createdBy: string;
  createdAt: number;
  scores: Record<string, number>;
}
