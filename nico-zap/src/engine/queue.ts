import type { EndAction, VideoItem } from "../types";

export interface GridState {
  slots: (VideoItem | null)[];
  queue: VideoItem[];
  // Incremented when a slot receives a new item, so the tile restarts.
  generations: number[];
}

export function initGrid(items: VideoItem[], size: number): GridState {
  const slots = Array.from({ length: size }, (_, i) => items[i] ?? null);
  return { slots, queue: items.slice(size), generations: slots.map(() => 0) };
}

export function contains(state: GridState, id: string): boolean {
  return state.slots.some((s) => s?.id === id) || state.queue.some((q) => q.id === id);
}

// Puts the item into the first empty slot, or at the end of the queue when the grid is full.
export function addItem(state: GridState, item: VideoItem): GridState {
  const empty = state.slots.indexOf(null);
  if (empty < 0) return { ...state, queue: [...state.queue, item] };
  const slots = [...state.slots];
  const generations = [...state.generations];
  slots[empty] = item;
  generations[empty]++;
  return { ...state, slots, generations };
}

// Removes the item in `slot`; the next queued item (if any) takes its place.
export function removeSlot(state: GridState, slot: number): GridState {
  if (!state.slots[slot]) return state;
  const slots = [...state.slots];
  const generations = [...state.generations];
  const [next, ...rest] = state.queue;
  slots[slot] = next ?? null;
  generations[slot]++;
  return { slots, queue: next ? rest : state.queue, generations };
}

export function removeQueued(state: GridState, index: number): GridState {
  return { ...state, queue: state.queue.filter((_, i) => i !== index) };
}

// Called when the tile in `slot` finishes. Slot positions never move.
export function finishSlot(state: GridState, slot: number, action: EndAction): GridState {
  const current = state.slots[slot];
  if (!current) return state;
  const slots = [...state.slots];
  const generations = [...state.generations];
  generations[slot]++;
  if (action === "remove") {
    slots[slot] = null;
    return { ...state, slots, generations };
  }
  const [next, ...rest] = state.queue;
  if (!next) {
    // Nothing waiting: replay the same video.
    return { ...state, generations };
  }
  slots[slot] = next;
  return { slots, queue: [...rest, current], generations };
}

// Changes the number of slots, keeping the current order: playing items first, then the queue.
export function resizeGrid(state: GridState, size: number): GridState {
  const items = [...state.slots.filter((s): s is VideoItem => s !== null), ...state.queue];
  return initGrid(items, size);
}
