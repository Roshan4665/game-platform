import { ref, set, get, update, push, onValue, off } from "firebase/database";
import { db } from "./firebase";
import { GameRoom, GameType, Player, Round, HintSource, RoundPhase, DoodleRound } from "./types";
import { nanoid } from "nanoid";

export async function createRoom(
  gameType: GameType,
  totalRounds: number,
  player: Player
): Promise<string> {
  const roomId = nanoid(6).toUpperCase();
  const room: GameRoom = {
    id: roomId,
    gameType,
    status: "waiting",
    totalRounds,
    currentRound: 0,
    players: { [player.id]: player },
    rounds: {},
    createdBy: player.id,
    createdAt: Date.now(),
    scores: { [player.id]: 0 },
  };
  await set(ref(db, `rooms/${roomId}`), room);
  return roomId;
}

export async function joinRoom(roomId: string, player: Player): Promise<GameRoom | null> {
  const snapshot = await get(ref(db, `rooms/${roomId}`));
  if (!snapshot.exists()) return null;
  const room = snapshot.val() as GameRoom;
  const playerCount = Object.keys(room.players || {}).length;
  if (playerCount >= 2) {
    // Check if this player is already in the room
    if (room.players[player.id]) return room;
    return null;
  }
  await update(ref(db, `rooms/${roomId}/players`), { [player.id]: player });
  await update(ref(db, `rooms/${roomId}/scores`), { [player.id]: 0 });
  return { ...room, players: { ...room.players, [player.id]: player } };
}

export async function startGame(roomId: string) {
  const snapshot = await get(ref(db, `rooms/${roomId}`));
  if (!snapshot.exists()) return;
  const room = snapshot.val() as GameRoom;
  const playerIds = Object.keys(room.players);
  if (playerIds.length !== 2) return;

  if (room.gameType === "doodle-battle") {
    const doodleRound: DoodleRound = {
      roundNumber: 1,
      phase: "generating-prompt",
      drawings: {},
      scores: {},
    };
    await update(ref(db, `rooms/${roomId}`), {
      status: "playing",
      currentRound: 1,
      "doodleRounds/1": doodleRound,
    });
    return;
  }

  const round: Round = {
    roundNumber: 1,
    pickerId: playerIds[0],
    guesserId: playerIds[1],
    hintSource: "llm",
    phase: "picking-word",
    roundPoints: 100,
  };

  await update(ref(db, `rooms/${roomId}`), {
    status: "playing",
    currentRound: 1,
    "rounds/1": round,
  });
}

export async function setWord(
  roomId: string,
  roundNumber: number,
  word: string,
  hintSource: HintSource
) {
  await update(ref(db, `rooms/${roomId}/rounds/${roundNumber}`), {
    word: word.toLowerCase().trim(),
    hintSource,
    phase: "guessing",
  });
}

export async function addHint(roomId: string, roundNumber: number, hint: { text: string; source: HintSource }) {
  // Check if this is the first hint (free)
  const hintsSnap = await get(ref(db, `rooms/${roomId}/rounds/${roundNumber}/hints`));
  const isFirstHint = !hintsSnap.exists() || Object.keys(hintsSnap.val()).length === 0;

  const hintsRef = ref(db, `rooms/${roomId}/rounds/${roundNumber}/hints`);
  await push(hintsRef, { ...hint, timestamp: Date.now() });

  // First hint is free, subsequent hints cost 5 points
  if (!isFirstHint) {
    await deductPoints(roomId, roundNumber, 5);
  }
}

export async function revealLetter(roomId: string, roundNumber: number, word: string) {
  // Max reveals = floor((wordLength - 1) / 2)
  const maxReveals = Math.floor((word.length - 1) / 2);
  if (maxReveals <= 0) return;

  const costPerReveal = Math.round(50 / maxReveals);

  const snap = await get(ref(db, `rooms/${roomId}/rounds/${roundNumber}/revealedIndices`));
  const revealed: number[] = snap.exists() ? snap.val() : [];

  if (revealed.length >= maxReveals) return; // already at max

  // Pick a random unrevealed index
  const unrevealed = Array.from({ length: word.length }, (_, i) => i)
    .filter((i) => !revealed.includes(i));
  if (unrevealed.length === 0) return;

  const randomIdx = unrevealed[Math.floor(Math.random() * unrevealed.length)];
  const newRevealed = [...revealed, randomIdx];

  await update(ref(db, `rooms/${roomId}/rounds/${roundNumber}`), {
    revealedIndices: newRevealed,
  });
  await deductPoints(roomId, roundNumber, costPerReveal);
}

export async function addQuestion(roomId: string, roundNumber: number, question: string) {
  // Check if this is the first question (free)
  const qSnap = await get(ref(db, `rooms/${roomId}/rounds/${roundNumber}/questions`));
  const isFirstQuestion = !qSnap.exists() || Object.keys(qSnap.val()).length === 0;

  const qRef = ref(db, `rooms/${roomId}/rounds/${roundNumber}/questions`);
  await push(qRef, { question, timestamp: Date.now() });

  // First question is free, subsequent ones cost 5 points
  if (!isFirstQuestion) {
    await deductPoints(roomId, roundNumber, 5);
  }
}

export async function answerQuestion(
  roomId: string,
  roundNumber: number,
  questionId: string,
  answer: "yes" | "no",
  answeredBy: HintSource
) {
  await update(ref(db, `rooms/${roomId}/rounds/${roundNumber}/questions/${questionId}`), {
    answer,
    answeredBy,
  });
}

export async function deductPoints(roomId: string, roundNumber: number, amount: number) {
  const snap = await get(ref(db, `rooms/${roomId}/rounds/${roundNumber}/roundPoints`));
  const current = snap.val() ?? 100;
  const newPoints = Math.max(0, current - amount);
  await update(ref(db, `rooms/${roomId}/rounds/${roundNumber}`), { roundPoints: newPoints });
}

export async function submitGuess(
  roomId: string,
  roundNumber: number,
  guess: string,
  actualWord: string,
  guesserId: string,
) {
  const isCorrect = guess.toLowerCase().trim() === actualWord.toLowerCase().trim();

  // Record the guess
  const guessesRef = ref(db, `rooms/${roomId}/rounds/${roundNumber}/guesses`);
  await push(guessesRef, { text: guess.toLowerCase().trim(), timestamp: Date.now() });

  if (isCorrect) {
    // Award current round points to guesser
    const pointsSnap = await get(ref(db, `rooms/${roomId}/rounds/${roundNumber}/roundPoints`));
    const earnedPoints = Math.max(0, pointsSnap.val() ?? 0);

    const scoresSnap = await get(ref(db, `rooms/${roomId}/scores`));
    const scores = scoresSnap.val() || {};
    scores[guesserId] = (scores[guesserId] || 0) + earnedPoints;

    await update(ref(db, `rooms/${roomId}/rounds/${roundNumber}`), {
      isCorrect: true,
      phase: "round-result",
    });
    await update(ref(db, `rooms/${roomId}/scores`), scores);
  } else {
    // Wrong guess: deduct 5 points
    await deductPoints(roomId, roundNumber, 5);
    await update(ref(db, `rooms/${roomId}/rounds/${roundNumber}`), {
      isCorrect: false,
    });
  }
}

export async function giveUpRound(roomId: string, roundNumber: number) {
  await update(ref(db, `rooms/${roomId}/rounds/${roundNumber}`), {
    gaveUp: true,
    roundPoints: 0,
    phase: "round-result",
  });
}

export async function nextRound(roomId: string) {
  const snapshot = await get(ref(db, `rooms/${roomId}`));
  if (!snapshot.exists()) return;
  const room = snapshot.val() as GameRoom;
  const nextRoundNum = room.currentRound + 1;

  if (nextRoundNum > room.totalRounds) {
    await update(ref(db, `rooms/${roomId}`), { status: "finished" });
    return;
  }

  if (room.gameType === "doodle-battle") {
    const doodleRound: DoodleRound = {
      roundNumber: nextRoundNum,
      phase: "generating-prompt",
      drawings: {},
      scores: {},
    };
    await update(ref(db, `rooms/${roomId}`), {
      currentRound: nextRoundNum,
      [`doodleRounds/${nextRoundNum}`]: doodleRound,
    });
    return;
  }

  // Alternate picker/guesser each round
  const prevRound = room.rounds[room.currentRound];
  const round: Round = {
    roundNumber: nextRoundNum,
    pickerId: prevRound.guesserId,
    guesserId: prevRound.pickerId,
    hintSource: "llm",
    phase: "picking-word",
    roundPoints: 100,
  };

  await update(ref(db, `rooms/${roomId}`), {
    currentRound: nextRoundNum,
    [`rounds/${nextRoundNum}`]: round,
  });
}

export function subscribeToRoom(roomId: string, callback: (room: GameRoom | null) => void) {
  const roomRef = ref(db, `rooms/${roomId}`);
  onValue(roomRef, (snapshot) => {
    callback(snapshot.exists() ? (snapshot.val() as GameRoom) : null);
  });
  return () => off(roomRef);
}

// Doodle game functions

export async function setDoodlePrompt(roomId: string, roundNumber: number, prompt: string) {
  await update(ref(db, `rooms/${roomId}/doodleRounds/${roundNumber}`), {
    prompt,
    phase: "drawing",
    startedAt: Date.now(),
  });
}

export async function saveDoodleDrawing(roomId: string, roundNumber: number, playerId: string, imageData: string) {
  await update(ref(db, `rooms/${roomId}/doodleRounds/${roundNumber}/drawings/${playerId}`), {
    imageData,
    lastUpdated: Date.now(),
  });
}

export async function saveDoodleScore(
  roomId: string,
  roundNumber: number,
  playerId: string,
  score: number,
  suggestion: string
) {
  const scoresRef = ref(db, `rooms/${roomId}/doodleRounds/${roundNumber}/scores/${playerId}`);
  await push(scoresRef, { score, suggestion, timestamp: Date.now() });
}

export async function finishDoodleRound(
  roomId: string,
  roundNumber: number,
  finalScores: Record<string, number>,
  verdict: string
) {
  await update(ref(db, `rooms/${roomId}/doodleRounds/${roundNumber}`), {
    phase: "round-result",
    finalScores,
    verdict,
  });

  const scoresSnap = await get(ref(db, `rooms/${roomId}/scores`));
  const scores = scoresSnap.val() || {};
  for (const [pid, pts] of Object.entries(finalScores)) {
    scores[pid] = (scores[pid] || 0) + pts;
  }
  await update(ref(db, `rooms/${roomId}/scores`), scores);
}
