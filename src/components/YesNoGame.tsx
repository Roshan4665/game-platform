"use client";

import { useState } from "react";
import { GameRoom, Round, YesNoQuestion } from "@/lib/types";
import { setWord, addQuestion, answerQuestion, submitGuess, giveUpRound, nextRound, revealLetter } from "@/lib/room";

interface Props {
  room: GameRoom;
  round: Round;
  playerId: string;
}

export default function YesNoGame({ room, round, playerId }: Props) {
  const [wordInput, setWordInput] = useState("");
  const [questionInput, setQuestionInput] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [hintSource, setHintSource] = useState<"llm" | "player">("llm");
  const [loading, setLoading] = useState(false);

  const isPicker = round.pickerId === playerId;
  const isGuesser = round.guesserId === playerId;
  const pickerName = room.players[round.pickerId]?.name || "Player";
  const guesserName = room.players[round.guesserId]?.name || "Player";
  const questions: (YesNoQuestion & { id: string })[] = round.questions
    ? Object.entries(round.questions).map(([id, q]) => ({ ...q, id }))
    : [];
  const guesses = round.guesses ? Object.values(round.guesses) : [];
  const points = round.roundPoints ?? 100;
  const revealed: number[] = round.revealedIndices || [];
  const word = round.word || "";
  const maxReveals = Math.floor((word.length - 1) / 2);
  const costPerReveal = maxReveals > 0 ? Math.round(50 / maxReveals) : 0;

  const doGuess = async () => {
    if (!guessInput.trim()) return;
    setLoading(true);
    await submitGuess(room.id, round.roundNumber, guessInput, round.word!, round.guesserId);
    setGuessInput("");
    setLoading(false);
  };

  const wordDisplay = word.split("").map((ch, i) => ({
    char: revealed.includes(i) ? ch.toUpperCase() : "_",
    isRevealed: revealed.includes(i),
  }));

  const askQuestion = async () => {
    if (!questionInput.trim()) return;
    const q = questionInput.trim();
    setQuestionInput("");
    await addQuestion(room.id, round.roundNumber, q);
    if (round.hintSource === "llm") {
      try {
        const res = await fetch("/api/answer-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word: round.word, question: q }),
        });
        const data = await res.json();
        setTimeout(async () => {
          const { ref, get: fbGet } = await import("firebase/database");
          const { db } = await import("@/lib/firebase");
          const qSnap = await fbGet(ref(db, `rooms/${room.id}/rounds/${round.roundNumber}/questions`));
          if (qSnap.exists()) {
            const qs = qSnap.val();
            const lastKey = Object.keys(qs).pop()!;
            await answerQuestion(room.id, round.roundNumber, lastKey, data.answer, "llm");
          }
        }, 500);
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Phase: Picking word
  if (round.phase === "picking-word") {
    if (isPicker) {
      return (
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-lg font-semibold mb-2">Your turn to pick a word</h2>
          <p className="text-sm text-gray-400 mb-4">Choose who answers Yes/No questions</p>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setHintSource("llm")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                hintSource === "llm" ? "bg-purple-600" : "bg-gray-800 text-gray-400"
              }`}
            >
              🤖 AI Answers
            </button>
            <button
              onClick={() => setHintSource("player")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                hintSource === "player" ? "bg-purple-600" : "bg-gray-800 text-gray-400"
              }`}
            >
              ✍️ I Answer
            </button>
          </div>
          <input
            type="text"
            value={wordInput}
            onChange={(e) => setWordInput(e.target.value)}
            placeholder="Enter a word..."
            className="w-full px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none mb-3"
            aria-label="Secret word"
          />
          <button
            onClick={async () => {
              if (!wordInput.trim()) return;
              setLoading(true);
              await setWord(room.id, round.roundNumber, wordInput, hintSource);
              setLoading(false);
            }}
            disabled={loading || !wordInput.trim()}
            className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg font-medium transition-colors"
          >
            {loading ? "Setting up..." : "Set Word"}
          </button>
        </div>
      );
    }
    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-center">
        <p className="text-gray-400">{pickerName} is picking a word...</p>
        <div className="mt-4 animate-pulse text-2xl">🤔</div>
      </div>
    );
  }

  // Phase: Guessing
  if (round.phase === "guessing") {
    const unanswered = questions.find((q) => !q.answer);

    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            {isGuesser ? "Ask Yes/No questions!" : `${guesserName} is asking questions`}
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs px-2 py-1 bg-gray-800 rounded-full text-gray-400">
              Answers by: {round.hintSource === "llm" ? "🤖 AI" : `✍️ ${pickerName}`}
            </span>
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${
              points > 50 ? "bg-green-900 text-green-400" :
              points > 20 ? "bg-yellow-900 text-yellow-400" :
              "bg-red-900 text-red-400"
            }`}>
              {points} pts
            </span>
          </div>
        </div>

        {isPicker && (
          <div className="mb-4 p-3 bg-gray-800 rounded-lg">
            <p className="text-sm text-gray-400">Your word:</p>
            <p className="text-xl font-bold text-purple-400">{round.word}</p>
          </div>
        )}

        {/* Word blanks display */}
        <div className="mb-5 p-4 bg-gray-800 rounded-lg text-center">
          <div className="flex justify-center gap-2 flex-wrap">
            {wordDisplay.map((slot, i) => (
              <span
                key={i}
                className={`text-2xl font-mono font-bold w-9 h-10 flex items-center justify-center rounded ${
                  slot.isRevealed
                    ? "bg-purple-900/50 text-purple-300"
                    : "bg-gray-700 text-gray-500"
                }`}
              >
                {slot.char}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">{word.length} letters</p>
          {isGuesser && revealed.length < maxReveals && maxReveals > 0 && (
            <button
              onClick={() => revealLetter(room.id, round.roundNumber, word)}
              className="mt-3 px-4 py-1.5 bg-purple-800 hover:bg-purple-700 rounded-lg text-sm transition-colors"
            >
              🔍 Reveal a letter (-{costPerReveal} pts) · {maxReveals - revealed.length} left
            </button>
          )}
          {isGuesser && revealed.length >= maxReveals && maxReveals > 0 && (
            <p className="mt-2 text-xs text-gray-500">Max letters revealed</p>
          )}
        </div>

        {/* Questions list */}
        <div className="space-y-2 mb-4">
          <p className="text-sm text-gray-400">
            Questions ({questions.length}) · 1st free, then -5 pts each
          </p>
          {questions.map((q, i) => (
            <div key={q.id} className="p-3 bg-gray-800 rounded-lg">
              <p className="text-sm">
                {q.question}
                {i === 0 && <span className="text-xs text-green-500 ml-2">(free)</span>}
              </p>
              {q.answer ? (
                <p className={`text-sm font-bold mt-1 ${q.answer === "yes" ? "text-green-400" : "text-red-400"}`}>
                  {q.answer.toUpperCase()}
                  <span className="text-xs text-gray-500 ml-2">
                    ({q.answeredBy === "llm" ? "🤖" : "✍️"})
                  </span>
                </p>
              ) : (
                <p className="text-xs text-yellow-400 mt-1">Waiting for answer...</p>
              )}
            </div>
          ))}
          {questions.length === 0 && (
            <p className="text-sm text-gray-500 italic">No questions yet</p>
          )}
        </div>

        {/* Previous wrong guesses */}
        {guesses.length > 0 && (
          <div className="mb-4">
            <p className="text-sm text-gray-400 mb-2">Wrong guesses · -5 pts each</p>
            <div className="flex flex-wrap gap-2">
              {guesses.map((g, i) => (
                <span key={i} className="px-3 py-1 bg-red-900/30 text-red-400 rounded-full text-sm">
                  {g.text}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Picker answers manually */}
        {isPicker && round.hintSource === "player" && unanswered && (
          <div className="mb-3 p-3 bg-gray-800 rounded-lg border border-yellow-600">
            <p className="text-sm mb-2">Answer: &quot;{unanswered.question}&quot;</p>
            <div className="flex gap-2">
              <button
                onClick={() => answerQuestion(room.id, round.roundNumber, unanswered.id, "yes", "player")}
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => answerQuestion(room.id, round.roundNumber, unanswered.id, "no", "player")}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
              >
                No
              </button>
            </div>
          </div>
        )}

        {/* Ask question (guesser) */}
        {isGuesser && !unanswered && (
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && askQuestion()}
              placeholder={`Ask a yes/no question... ${questions.length === 0 ? "(free)" : "(-5 pts)"}`}
              className="flex-1 px-3 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none text-sm"
              aria-label="Your question"
            />
            <button
              onClick={askQuestion}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm transition-colors"
            >
              Ask
            </button>
          </div>
        )}

        {isGuesser && unanswered && (
          <p className="text-sm text-yellow-400 mb-3">Waiting for answer to your question...</p>
        )}

        {/* Guess input + Give Up */}
        {isGuesser && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={guessInput}
                onChange={(e) => setGuessInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doGuess()}
                placeholder="Ready to guess? Type the word..."
                className="flex-1 px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:border-green-500 focus:outline-none"
                aria-label="Your guess"
              />
              <button
                onClick={doGuess}
                disabled={loading || !guessInput.trim()}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg font-medium transition-colors"
              >
                Guess
              </button>
            </div>
            <button
              onClick={() => giveUpRound(room.id, round.roundNumber)}
              className="w-full py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg text-sm transition-colors"
            >
              Give Up (0 pts)
            </button>
          </div>
        )}
      </div>
    );
  }

  // Phase: Round result
  if (round.phase === "round-result") {
    const earnedPoints = round.isCorrect ? round.roundPoints : 0;
    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-center">
        <div className="text-4xl mb-4">{round.isCorrect ? "🎉" : round.gaveUp ? "🏳️" : "😅"}</div>
        <h2 className="text-xl font-bold mb-2">
          {round.isCorrect ? "Correct!" : round.gaveUp ? "Gave Up!" : "Wrong!"}
        </h2>
        <p className="text-gray-400 mb-1">
          The word was: <span className="text-white font-bold">{round.word}</span>
        </p>
        {round.isCorrect && (
          <p className="text-green-400 font-bold mb-4">+{earnedPoints} points</p>
        )}
        {!round.isCorrect && (
          <p className="text-red-400 font-bold mb-4">+0 points</p>
        )}
        <button
          onClick={() => nextRound(room.id)}
          className="px-8 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
        >
          {room.currentRound >= room.totalRounds ? "See Results" : "Next Round"}
        </button>
      </div>
    );
  }

  return null;
}
