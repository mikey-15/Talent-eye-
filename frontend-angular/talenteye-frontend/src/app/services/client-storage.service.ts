import { Injectable } from '@angular/core';

export interface SavedPlayerEntry {
  id: number;
  username: string;
  savedAt: string;
}

export interface UiSettings {
  emailTips: boolean;
  digestWeekly: boolean;
  reducedMotion: boolean;
}

const KEY_SAVED = 'talenteye_scout_saved_players';
const KEY_COMPARE = 'talenteye_scout_compare_player_ids';
const KEY_UI = 'talenteye_ui_settings';
const NOTES_PREFIX = 'talenteye_scout_notes_';
const MAX_COMPARE = 4;

const defaultUi: UiSettings = {
  emailTips: true,
  digestWeekly: false,
  reducedMotion: false
};

@Injectable({ providedIn: 'root' })
export class ClientStorageService {
  getSavedPlayers(): SavedPlayerEntry[] {
    try {
      const raw = localStorage.getItem(KEY_SAVED);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SavedPlayerEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  getSavedPlayerIds(): number[] {
    return this.getSavedPlayers().map((p) => p.id);
  }

  addSavedPlayer(id: number, username: string): boolean {
    const list = this.getSavedPlayers();
    if (list.some((p) => p.id === id)) return false;
    list.push({ id, username, savedAt: new Date().toISOString() });
    localStorage.setItem(KEY_SAVED, JSON.stringify(list));
    return true;
  }

  removeSavedPlayer(id: number): void {
    const list = this.getSavedPlayers().filter((p) => p.id !== id);
    localStorage.setItem(KEY_SAVED, JSON.stringify(list));
  }

  isPlayerSaved(id: number): boolean {
    return this.getSavedPlayers().some((p) => p.id === id);
  }

  getCompareIds(): number[] {
    try {
      const raw = localStorage.getItem(KEY_COMPARE);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as number[];
      return Array.isArray(parsed) ? parsed.filter((n) => Number.isFinite(n)) : [];
    } catch {
      return [];
    }
  }

  /** If at capacity and id is new, returns { ok: false, atCapacity: true }. */
  addToCompare(id: number): { ok: boolean; atCapacity?: boolean } {
    let ids = this.getCompareIds();
    if (ids.includes(id)) return { ok: true };
    if (ids.length >= MAX_COMPARE) return { ok: false, atCapacity: true };
    ids = [...ids, id];
    localStorage.setItem(KEY_COMPARE, JSON.stringify(ids));
    return { ok: true };
  }

  removeFromCompare(id: number): void {
    const ids = this.getCompareIds().filter((x) => x !== id);
    localStorage.setItem(KEY_COMPARE, JSON.stringify(ids));
  }

  clearCompare(): void {
    localStorage.removeItem(KEY_COMPARE);
  }

  getScoutNotes(playerId: number): string {
    return localStorage.getItem(`${NOTES_PREFIX}${playerId}`) ?? '';
  }

  setScoutNotes(playerId: number, body: string): void {
    localStorage.setItem(`${NOTES_PREFIX}${playerId}`, body);
  }

  clearScoutNotes(playerId: number): void {
    localStorage.removeItem(`${NOTES_PREFIX}${playerId}`);
  }

  getUiSettings(): UiSettings {
    try {
      const raw = localStorage.getItem(KEY_UI);
      if (!raw) return { ...defaultUi };
      return { ...defaultUi, ...JSON.parse(raw) };
    } catch {
      return { ...defaultUi };
    }
  }

  patchUiSettings(partial: Partial<UiSettings>): void {
    const next = { ...this.getUiSettings(), ...partial };
    localStorage.setItem(KEY_UI, JSON.stringify(next));
  }
}
