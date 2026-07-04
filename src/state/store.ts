import { create } from 'zustand';

/** How the chamber is driven. */
export type DriveMode = 'knob' | 'tilt' | 'shake';

/** One fragment that the user has dropped into the kaleidoscope. */
export interface PlacedFragment {
  key: number;     // stable identity
  itemId: string;  // → FRAGMENT_CATALOG item
}

const MAX_FRAGMENTS = 32; // keep in sync with the shader

interface KaleidoscopeState {
  mirrors: number;
  mode: DriveMode;

  /** The loose pile currently in the chamber. */
  fragments: PlacedFragment[];

  /** Fragment picker popup. */
  pickerOpen: boolean;
  activeCat: string;

  setMirrors: (sides: number) => void;
  setMode: (mode: DriveMode) => void;

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
  fragments: [],
  pickerOpen: false,
  activeCat: 'glass',

  setMirrors: (sides) => set({ mirrors: sides }),
  setMode: (mode) => set({ mode }),

  addFragment: (itemId) =>
    set((s) => {
      if (s.fragments.length >= MAX_FRAGMENTS) {
        // pile is full — drop the oldest to make room (FIFO)
        return { fragments: [...s.fragments.slice(1), { key: nextKey++, itemId }] };
      }
      return { fragments: [...s.fragments, { key: nextKey++, itemId }] };
    }),
  clearFragments: () => set({ fragments: [] }),

  openPicker: () => set({ pickerOpen: true }),
  closePicker: () => set({ pickerOpen: false }),
  setActiveCat: (catId) => set({ activeCat: catId }),
}));

export { MAX_FRAGMENTS };
