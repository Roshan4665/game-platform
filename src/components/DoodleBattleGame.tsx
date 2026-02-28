"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { GameRoom, DoodleRound } from "@/lib/types";
import {
  setDoodlePrompt,
  saveDoodleDrawing,
  saveDoodleScore,
  finishDoodleRound,
  nextRound,
} from "@/lib/room";
import DrawingCanvas from "./DrawingCanvas";

interface Props {
  room: GameRoom;
  doodleRound: DoodleRound;
  playerId: string;
}

const ROUND_DURATION = 60;
const SCORE_INTERVAL = 30;

export default function DoodleBattleGame({ room, doodleRound, playerId }: Props) {
  const [timeLeft, setTimeLeft] = useState(ROUND_DURATION);
  const [myLatestScore, setMyLatestScore] = useState<{ score: number; suggestion: string } | null>(null);
  const [showInstructions, setShowInstructions] = useState(true);
  const lastScoreTimeRef = useRef(0);
  const scoringInProgressRef = useRef(false);
  const latestDrawingRef = useRef<string>("");
  const players = Object.values(room.players);

  const myScores = doodleRound.scores?.[playerId]
    ? Object.values(doodleRound.scores[playerId])
    : [];

  // Generate prompt
  useEffect(() => {
    if (doodleRound.phase !== "generating-prompt") return;
    if (room.createdBy !== playerId) return;
    const generatePrompt = async () => {
      try {
        const prevPrompts: string[] = [];
        if (room.doodleRounds) {
          for (const r of Object.values(room.doodleRounds)) {
            if (r.prompt) prevPrompts.push(r.prompt);
          }
        }
        const res = await fetch("/api/doodle-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ previousPrompts: prevPrompts }),
        });
        const data = await res.json();
        if (data.prompt) await setDoodlePrompt(room.id, doodleRound.roundNumber, data.prompt);
      } catch (e) {
        console.error("Failed to generate prompt", e);
      }
    };
    generatePrompt();
  }, [doodleRound.phase, doodleRound.roundNumber, room.id, room.createdBy, playerId, room.doodleRounds]);

  // Timer
  useEffect(() => {
    if (doodleRound.phase !== "drawing" || !doodleRound.startedAt) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - doodleRound.startedAt!) / 1000);
      const remaining = Math.max(0, ROUND_DURATION - elapsed);
      setTimeLeft(remaining);
      if (remaining <= 0) handleTimeUp();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doodleRound.phase, doodleRound.startedAt]);

  // Midway scoring at 30s
  useEffect(() => {
    if (doodleRound.phase !== "drawing" || !doodleRound.startedAt) return;
    const checkScore = () => {
      const elapsed = Math.floor((Date.now() - doodleRound.startedAt!) / 1000);
      const scoreCheckpoint = Math.floor(elapsed / SCORE_INTERVAL);
      if (scoreCheckpoint > lastScoreTimeRef.current && scoreCheckpoint <= 1 && !scoringInProgressRef.current) {
        lastScoreTimeRef.current = scoreCheckpoint;
        if (room.createdBy === playerId) triggerScoring(false);
      }
    };
    const interval = setInterval(checkScore, 2000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doodleRound.phase, doodleRound.startedAt, playerId, room.createdBy]);

  const fetchFreshDrawings = async () => {
    const { ref, get: fbGet } = await import("firebase/database");
    const { db } = await import("@/lib/firebase");
    const snap = await fbGet(ref(db, `rooms/${room.id}/doodleRounds/${doodleRound.roundNumber}/drawings`));
    return snap.exists() ? snap.val() : {};
  };

  const triggerScoring = async (isFinal: boolean) => {
    if (scoringInProgressRef.current) return;
    scoringInProgressRef.current = true;
    try {
      const freshDrawings = await fetchFreshDrawings();
      const drawingsData: Record<string, { name: string; imageData: string }> = {};
      const playerIds = Object.keys(room.players);
      for (const pid of playerIds) {
        const drawing = freshDrawings[pid];
        if (drawing?.imageData) {
          drawingsData[pid] = { name: room.players[pid].name, imageData: drawing.imageData };
        }
      }
      if (Object.keys(drawingsData).length < 2) {
        scoringInProgressRef.current = false;
        if (isFinal) {
          const finalScores: Record<string, number> = {};
          for (const pid of playerIds) finalScores[pid] = drawingsData[pid] ? 5 : 0;
          await finishDoodleRound(room.id, doodleRound.roundNumber, finalScores, "Not enough drawings to compare.");
        }
        return;
      }

      const res = await fetch("/api/doodle-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: doodleRound.prompt, drawings: drawingsData, isFinal }),
      });
      const data = await res.json();

      if (data.scores) {
        if (isFinal) {
          // Final: just store finalScores + verdict, no saveDoodleScore
          const finalScores: Record<string, number> = {};
          for (const [pid, s] of Object.entries(data.scores) as [string, { score: number }][]) {
            finalScores[pid] = s.score;
          }
          await finishDoodleRound(room.id, doodleRound.roundNumber, finalScores, data.verdict || "Both gave it a good shot!");
        } else {
          // Midway: save scores with suggestions
          for (const [pid, s] of Object.entries(data.scores) as [string, { score: number; suggestion: string }][]) {
            await saveDoodleScore(room.id, doodleRound.roundNumber, pid, s.score, s.suggestion || "Keep going!");
          }
        }
      }
    } catch (e) {
      console.error("Scoring error:", e);
      if (isFinal) {
        const finalScores: Record<string, number> = {};
        for (const pid of Object.keys(room.players)) finalScores[pid] = 5;
        await finishDoodleRound(room.id, doodleRound.roundNumber, finalScores, "Scoring failed, equal points awarded.");
      }
    }
    scoringInProgressRef.current = false;
  };

  const handleTimeUp = async () => {
    if (doodleRound.phase !== "drawing") return;
    if (latestDrawingRef.current) {
      await saveDoodleDrawing(room.id, doodleRound.roundNumber, playerId, latestDrawingRef.current);
    }
    if (room.createdBy === playerId) {
      setTimeout(() => triggerScoring(true), 2000);
    }
  };

  const handleDrawingSave = useCallback(async (imageData: string) => {
    latestDrawingRef.current = imageData;
    await saveDoodleDrawing(room.id, doodleRound.roundNumber, playerId, imageData);
  }, [room.id, doodleRound.roundNumber, playerId]);

  // Show midway score + suggestion as toast
  useEffect(() => {
    if (myScores.length > 0) {
      const latest = myScores[myScores.length - 1];
      setMyLatestScore({ score: latest.score, suggestion: latest.suggestion || "" });
    }
  }, [myScores.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Instructions modal
  if (showInstructions && (doodleRound.phase === "generating-prompt" || doodleRound.phase === "drawing")) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 max-w-md w-full">
          <h2 className="text-xl font-bold text-center mb-4">🎨 Doodle Battle</h2>
          <div className="space-y-3 text-sm text-gray-300 mb-6">
            <p>⏱ You have <span className="text-white font-medium">60 seconds</span> to draw.</p>
            <p>🤖 AI scores at the <span className="text-white font-medium">30-second mark</span> with tips to improve, then gives a <span className="text-white font-medium">final score</span> when time runs out.</p>
            <p>📊 Scores are <span className="text-white font-medium">0–10</span> based on accuracy and how your drawing compares to your opponent&apos;s.</p>
            <p>🙈 You <span className="text-white font-medium">can&apos;t see</span> your opponent&apos;s drawing until the round ends.</p>
          </div>
          <button
            onClick={() => setShowInstructions(false)}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium text-lg transition-colors"
          >
            Got it, let&apos;s draw!
          </button>
        </div>
      </div>
    );
  }

  // Phase: Generating prompt
  if (doodleRound.phase === "generating-prompt") {
    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-center">
        <div className="animate-pulse text-4xl mb-4">🎨</div>
        <p className="text-gray-400">AI is thinking of something fun to draw...</p>
      </div>
    );
  }

  // Phase: Drawing
  if (doodleRound.phase === "drawing") {
    const timerColor = timeLeft > 30 ? "text-green-400" : timeLeft > 10 ? "text-yellow-400" : "text-red-400";

    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 relative">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold">Draw it!</h2>
          <span className={`text-2xl font-mono font-bold ${timerColor}`}>
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
          </span>
        </div>

        <div className="text-center mb-4">
          <p className="text-sm text-gray-400">Draw:</p>
          <p className="text-xl font-bold text-purple-400">{doodleRound.prompt}</p>
        </div>

        {/* Midway score as floating toast — score + improvement suggestion */}
        {myLatestScore && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl shadow-lg max-w-sm text-center">
            <span className="text-lg font-bold text-purple-400">{myLatestScore.score}/10</span>
            {myLatestScore.suggestion && (
              <p className="text-xs text-gray-400 mt-0.5">💡 {myLatestScore.suggestion}</p>
            )}
          </div>
        )}

        <DrawingCanvas onSave={handleDrawingSave} disabled={timeLeft <= 0} saveInterval={4000} />

        {timeLeft <= 0 && (
          <div className="mt-4 text-center">
            <p className="text-yellow-400 animate-pulse">Time is up! Calculating final scores...</p>
          </div>
        )}
      </div>
    );
  }

  // Phase: Final scoring (transition)
  if (doodleRound.phase === "final-scoring") {
    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-center">
        <div className="animate-pulse text-4xl mb-4">🏆</div>
        <p className="text-gray-400">AI is judging the final drawings...</p>
      </div>
    );
  }

  // Phase: Round result
  if (doodleRound.phase === "round-result") {
    const finalScores = doodleRound.finalScores || {};
    const playerIds = Object.keys(room.players);
    const sorted = [...playerIds].sort((a, b) => (finalScores[b] || 0) - (finalScores[a] || 0));
    const winnerId = sorted[0];
    const winnerScore = finalScores[winnerId] || 0;
    const loserScore = finalScores[sorted[1]] || 0;
    const isTie = winnerScore === loserScore;

    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 className="text-xl font-bold text-center mb-4">
          {isTie ? "🤝 It\u2019s a tie!" : `🏆 ${room.players[winnerId]?.name} wins this round!`}
        </h2>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {sorted.map((pid) => {
            const drawing = doodleRound.drawings?.[pid];
            return (
              <div key={pid} className="text-center">
                <p className="text-sm text-gray-400 mb-1">{room.players[pid]?.name}</p>
                <p className="text-2xl font-bold text-purple-400 mb-2">{finalScores[pid] || 0}/10</p>
                {drawing?.imageData && (
                  <img
                    src={drawing.imageData}
                    alt={`${room.players[pid]?.name}'s drawing`}
                    className="w-full aspect-square rounded-lg border border-gray-700 bg-white"
                  />
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-gray-400 mb-2">
          Prompt: <span className="text-white font-medium">{doodleRound.prompt}</span>
        </p>

        {/* AI verdict — single comparative line */}
        {doodleRound.verdict && (
          <div className="mb-4 p-3 bg-gray-800 rounded-lg text-center">
            <p className="text-sm text-gray-300">🤖 {doodleRound.verdict}</p>
          </div>
        )}

        <button
          onClick={() => nextRound(room.id)}
          className="w-full py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
        >
          {room.currentRound >= room.totalRounds ? "See Final Results" : "Next Round"}
        </button>
      </div>
    );
  }

  return null;
}
