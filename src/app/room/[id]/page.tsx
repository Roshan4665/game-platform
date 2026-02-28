"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getLocalPlayer, LocalPlayer } from "@/lib/player";
import { subscribeToRoom, startGame } from "@/lib/room";
import { GameRoom } from "@/lib/types";
import WordGuesserGame from "@/components/WordGuesserGame";
import YesNoGame from "@/components/YesNoGame";
import DoodleBattleGame from "@/components/DoodleBattleGame";

export default function RoomPage() {
  const params = useParams();
  const roomId = params.id as string;
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [player, setPlayer] = useState<LocalPlayer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPlayer(getLocalPlayer());
  }, []);

  useEffect(() => {
    const unsub = subscribeToRoom(roomId, (r) => {
      setRoom(r);
      setLoading(false);
    });
    return unsub;
  }, [roomId]);

  if (loading) {
    return <div className="text-center mt-20 text-gray-400">Loading room...</div>;
  }

  if (!room) {
    return <div className="text-center mt-20 text-red-400">Room not found</div>;
  }

  if (!player) {
    return <div className="text-center mt-20 text-red-400">Please set your name first</div>;
  }

  const players = Object.values(room.players || {});
  const isCreator = room.createdBy === player.id;
  const isInRoom = !!room.players?.[player.id];

  if (!isInRoom) {
    return <div className="text-center mt-20 text-red-400">You are not in this room</div>;
  }

  // Waiting lobby
  if (room.status === "waiting") {
    return (
      <div className="flex flex-col items-center gap-6 mt-12">
        <h1 className="text-2xl font-bold">Room: {roomId}</h1>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 w-full max-w-md">
          <p className="text-sm text-gray-400 mb-1">Game</p>
          <p className="font-medium mb-4">
            {room.gameType === "word-guesser" ? "🔤 Word Guesser" : room.gameType === "yes-no" ? "❓ Yes / No" : "🎨 Doodle Battle"}
          </p>
          <p className="text-sm text-gray-400 mb-1">Rounds</p>
          <p className="font-medium mb-4">{room.totalRounds}</p>
          <p className="text-sm text-gray-400 mb-1">Players ({players.length}/2)</p>
          {players.map((p) => (
            <p key={p.id} className="font-medium">
              {p.name} {p.id === room.createdBy && <span className="text-purple-400 text-xs">(host)</span>}
            </p>
          ))}
        </div>

        {players.length < 2 && (
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 w-full max-w-md text-center">
            <p className="text-sm text-gray-400 mb-2">Share this code with your friend</p>
            <p className="text-3xl font-mono font-bold tracking-widest text-purple-400">{roomId}</p>
          </div>
        )}

        {isCreator && players.length === 2 && (
          <button
            onClick={() => startGame(roomId)}
            className="px-8 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium text-lg transition-colors"
          >
            Start Game
          </button>
        )}

        {!isCreator && players.length === 2 && (
          <p className="text-gray-400">Waiting for host to start...</p>
        )}
      </div>
    );
  }

  // Game finished
  if (room.status === "finished") {
    const scores = room.scores || {};
    const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
    const winnerEntry = sorted[0];
    const winner = room.players[winnerEntry[0]];
    const isDoodle = room.gameType === "doodle-battle";
    const doodleRounds = room.doodleRounds || {};

    return (
      <div className="flex flex-col items-center gap-6 mt-12">
        <h1 className="text-3xl font-bold">Game Over</h1>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 w-full max-w-lg">
          <h2 className="text-xl font-semibold text-center mb-4">
            🏆 {winner?.name || "Unknown"} wins!
          </h2>
          {sorted.map(([pid, score]) => (
            <div key={pid} className="flex justify-between py-2 border-b border-gray-800 last:border-0">
              <span>{room.players[pid]?.name}</span>
              <span className="font-bold text-purple-400">{score} pts</span>
            </div>
          ))}
        </div>

        {/* Per-round breakdown for doodle-battle */}
        {isDoodle && Object.keys(doodleRounds).length > 0 && (
          <div className="w-full max-w-lg space-y-4">
            <h3 className="text-lg font-semibold text-center">Round-by-Round</h3>
            {Object.values(doodleRounds).map((dr) => {
              const fs = dr.finalScores || {};
              const pids = Object.keys(room.players);
              return (
                <div key={dr.roundNumber} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-400">Round {dr.roundNumber}</span>
                    <span className="text-sm text-purple-400 font-medium">{dr.prompt}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {pids.map((pid) => {
                      const drawing = dr.drawings?.[pid];
                      return (
                        <div key={pid} className="text-center">
                          <p className="text-xs text-gray-400">{room.players[pid]?.name}</p>
                          <p className="text-lg font-bold text-purple-400">{fs[pid] || 0}/10</p>
                          {drawing?.imageData && (
                            <img
                              src={drawing.imageData}
                              alt={`${room.players[pid]?.name}'s drawing`}
                              className="w-full aspect-square rounded-lg border border-gray-700 bg-white mt-1"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {dr.verdict && (
                    <p className="text-xs text-gray-400 text-center mt-2">🤖 {dr.verdict}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <a href="/" className="text-purple-400 hover:underline">Back to Home</a>
      </div>
    );
  }

  // Playing
  if (room.gameType === "doodle-battle") {
    const currentDoodleRound = room.doodleRounds?.[room.currentRound];
    if (!currentDoodleRound) {
      return <div className="text-center mt-20 text-gray-400">Loading round...</div>;
    }

    return (
      <div className="mt-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-lg font-bold">Room: {roomId}</h1>
          <div className="text-sm text-gray-400">
            Round {room.currentRound}/{room.totalRounds}
          </div>
        </div>

        <div className="flex justify-between mb-6 text-sm">
          {players.map((p) => (
            <div key={p.id} className="text-center">
              <p className="text-gray-400">{p.name}</p>
              <p className="text-xl font-bold text-purple-400">{room.scores?.[p.id] || 0}</p>
            </div>
          ))}
        </div>

        <DoodleBattleGame room={room} doodleRound={currentDoodleRound} playerId={player.id} />
      </div>
    );
  }

  const currentRound = room.rounds?.[room.currentRound];
  if (!currentRound) {
    return <div className="text-center mt-20 text-gray-400">Loading round...</div>;
  }

  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg font-bold">Room: {roomId}</h1>
        <div className="text-sm text-gray-400">
          Round {room.currentRound}/{room.totalRounds}
        </div>
      </div>

      <div className="flex justify-between mb-6 text-sm">
        {players.map((p) => (
          <div key={p.id} className="text-center">
            <p className="text-gray-400">{p.name}</p>
            <p className="text-xl font-bold text-purple-400">{room.scores?.[p.id] || 0}</p>
          </div>
        ))}
      </div>

      {room.gameType === "word-guesser" ? (
        <WordGuesserGame room={room} round={currentRound} playerId={player.id} />
      ) : (
        <YesNoGame room={room} round={currentRound} playerId={player.id} />
      )}
    </div>
  );
}
