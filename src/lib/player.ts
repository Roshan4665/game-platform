import { nanoid } from "nanoid";

const PLAYER_KEY = "game-platform-player";

export interface LocalPlayer {
  id: string;
  name: string;
}

export function getLocalPlayer(): LocalPlayer | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PLAYER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setLocalPlayer(name: string): LocalPlayer {
  const player: LocalPlayer = { id: nanoid(10), name };
  localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
  return player;
}

export function clearLocalPlayer() {
  localStorage.removeItem(PLAYER_KEY);
}
