"use client";

import { useState, useEffect } from "react";
import { getLocalPlayer, setLocalPlayer, LocalPlayer } from "@/lib/player";
import { createRoom, joinRoom } from "@/lib/room";
import { GameType } from "@/lib/types";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [player, setPlayer] = useState<LocalPlayer | null>(null);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [gameType, setGameType] = useState<GameType>("word-guesser");
  const [rounds, setRounds] = useState(5);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPlayer(getLocalPlayer());
  }, []);

  const handleSetName = () => {
    if (!name.trim()) return;
    const p = setLocalPlayer(name.trim());
    setPlayer(p);
  };

  const handleCreate = async () => {
    if (!player) return;
    setLoading(true);
    try {
      const roomId = await createRoom(gameType, rounds, {
        id: player.id,
        name: player.name,
        joinedAt: Date.now(),
      });
      router.push(`/room/${roomId}`);
    } catch {
      setError("Failed to create room");
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!player || !joinCode.trim()) return;
    setLoading(true);
    setError("");
    try {
      const room = await joinRoom(joinCode.trim().toUpperCase(), {
        id: player.id,
        name: player.name,
        joinedAt: Date.now(),
      });
      if (!room) {
        setError("Room not found or full");
        setLoading(false);
        return;
      }
      router.push(`/room/${joinCode.trim().toUpperCase()}`);
    } catch {
      setError("Failed to join room");
    }
    setLoading(false);
  };

  if (!player) {
    return (
      <div className="flex flex-col items-center gap-6 mt-20">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Game Platform
        </h1>
        <p className="text-gray-400">Enter your name to get started</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSetName()}
            placeholder="Your name"
            className="px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none"
            aria-label="Your name"
          />
          <button
            onClick={handleSetName}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
          >
            Go
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 mt-12">
      <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
        Game Platform
      </h1>
      <p className="text-gray-400">
        Hey <span className="text-white font-medium">{player.name}</span>
      </p>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Create Room */}
      <div className="w-full max-w-md bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 className="text-lg font-semibold mb-4">Create a Room</h2>

        <label className="block text-sm text-gray-400 mb-1">Game</label>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setGameType("word-guesser")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              gameType === "word-guesser"
                ? "bg-purple-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            🔤 Word Guesser
          </button>
          <button
            onClick={() => setGameType("yes-no")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              gameType === "yes-no"
                ? "bg-purple-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            ❓ Yes / No
          </button>
        </div>

        <label className="block text-sm text-gray-400 mb-1">Rounds</label>
        <select
          value={rounds}
          onChange={(e) => setRounds(Number(e.target.value))}
          className="w-full px-3 py-2 bg-gray-800 rounded-lg border border-gray-700 mb-4 focus:outline-none"
          aria-label="Number of rounds"
        >
          {[2, 4, 6, 8, 10].map((n) => (
            <option key={n} value={n}>{n} rounds</option>
          ))}
        </select>

        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg font-medium transition-colors"
        >
          {loading ? "Creating..." : "Create Room"}
        </button>
      </div>

      {/* Join Room */}
      <div className="w-full max-w-md bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 className="text-lg font-semibold mb-4">Join a Room</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="Room code"
            className="flex-1 px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none uppercase"
            aria-label="Room code"
            maxLength={6}
          />
          <button
            onClick={handleJoin}
            disabled={loading || !joinCode.trim()}
            className="px-6 py-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 rounded-lg font-medium transition-colors"
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}
