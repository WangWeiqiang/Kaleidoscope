import { create } from 'zustand';

/** How the chamber is driven. */
export type DriveMode = 'knob' | 'tilt' | 'shake';

/** Object-cell type: dry tumbling cell, or glycerine-filled oil cell. */
export type ChamberMode = 'dry' | 'oil';

/** One fragment that the user has dropped into the kaleidoscope. */
export interface PlacedFragment {
  key: number;     // stable identity
  itemId: string;  // → FRAGMENT_CATALOG item
  /** random size tier rolled when the piece is dropped in: 1 (tiny) … 10 (large) */
  scale: number;
}

const MAX_FRAGMENTS = 32; // keep in sync with the shader

interface KaleidoscopeState {
  mirrors: number;
  mode: DriveMode;
  chamber: ChamberMode;

  /** The loose pile currently in the chamber. */
  fragments: PlacedFragment[];

  /** Fragment picker popup. */
  pickerOpen: boolean;
  activeCat: string;

  setMirrors: (sides: number) => void;
  setMode: (mode: DriveMode) => void;
  setChamber: (chamber: ChamberMode) => void;

  addFragment: (itemId: string) => void;
  clearFragments: () => void;

  openPicker: () => void;
  closePicker: () => void;
  setActiveCat: (catId: string) => void;
}

let nextKey = 1;

export const useKaleidoscope = create<KaleidoscopeState>((set) => ({
  mirrors: 6,
  mode: 'knob',
  chamber: 'dry',
  fragments: [],
  pickerOpen: false,
  activeCat: 'glass',

  setMirrors: (sides) => set({ mirrors: sides }),
  setMode: (mode) => set({ mode }),
  setChamber: (chamber) => set({ chamber }),

  addFragment: (itemId) =>
    set((s) => {
      // every dropped piece rolls its own size — real shards are never uniform
      const piece = { key: nextKey++, itemId, scale: 1 + Math.random() * 9 };
      if (s.fragments.length >= MAX_FRAGMENTS) {
        // pile is full — drop the oldest to make room (FIFO)
        return { fragments: [...s.fragments.slice(1), piece] };
      }
      return { fragments: [...s.fragments, piece] };
    }),
  clearFragments: () => set({ fragments: [] }),

  openPicker: () => set({ pickerOpen: true }),
  closePicker: () => set({ pickerOpen: false }),
  setActiveCat: (catId) => set({ activeCat: catId }),
}));

export { MAX_FRAGMENTS };
