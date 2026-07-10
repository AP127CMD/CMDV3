import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeName = 'cockpit' | 'light' | 'warm';

interface ThemeState {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'cockpit',
      setTheme: (theme) => {
        document.body.dataset.theme = theme;
        set({ theme });
      },
    }),
    {
      name: 'ap127v3-theme',
      onRehydrateStorage: () => (state) => {
        if (state) document.body.dataset.theme = state.theme;
      },
    },
  ),
);

export const THEMES: Array<{ id: ThemeName; chip: string; label: string }> = [
  { id: 'cockpit', chip: 'C', label: 'Cockpit' },
  { id: 'light', chip: 'L', label: 'Light' },
  { id: 'warm', chip: 'W', label: 'Warm' },
];
