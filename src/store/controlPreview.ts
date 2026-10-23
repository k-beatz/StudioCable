import { create } from 'zustand';
import type { Control } from '../core/model';

/**
 * The knob or switch a finger is on right now. A finger covers the small
 * control, so the app shows it enlarged at the top of the screen.
 */
export interface ControlPreview {
  deviceName: string;
  control: Control;
  value: string | number;
}

interface State {
  preview: ControlPreview | null;
  show: (p: ControlPreview | null) => void;
}

export const useControlPreview = create<State>((set) => ({
  preview: null,
  show: (preview) => set({ preview }),
}));
