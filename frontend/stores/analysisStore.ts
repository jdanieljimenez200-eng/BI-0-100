import { create } from 'zustand';

interface AnalysisState {
  selectedProductId: string | null;
  setSelectedProductId: (id: string | null) => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  selectedProductId: null,
  setSelectedProductId: (id: string | null) => set({ selectedProductId: id }),
}));
