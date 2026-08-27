import { useSyncExternalStore } from "react";
import type { ReceiptWithMall } from "./types";
import { tierFromLifetime } from "./districts";

type MockTx = {
  id: string;
  receipt: ReceiptWithMall;
  buyerTotal: number;
  sellerPayout: number;
  status: 'pending_exchange' | 'validating' | 'completed' | 'disputed';
  side: 'buy' | 'sell';
  createdAt: number;
};

type State = {
  user: {
    name: string;
    initial: string;
    rating: number;
    deals: number;
    walletAvailable: number;
    walletPending: number;
    walletTotalEarned: number;
    points: number;
    lifetimePoints: number;
    pointsExpiry: string;
    currentMallId: string | null;
  };
  txs: MockTx[];
};

let listeners: Array<() => void> = [];
let state: State = {
  user: {
    name: "用戶", initial: "U", rating: 0, deals: 0,
    walletAvailable: 0, walletPending: 0, walletTotalEarned: 0,
    points: 0, lifetimePoints: 0,
    pointsExpiry: "",
    currentMallId: null,
  },
  txs: [],
};

export const mockStore = {
  get: () => state,
  addTx: (tx: MockTx) => {
    state = { ...state, txs: [tx, ...state.txs] };
    listeners.forEach((l) => l());
  },
  updateTx: (id: string, patch: Partial<MockTx>) => {
    state = { ...state, txs: state.txs.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
    listeners.forEach((l) => l());
  },
  setCurrentMall: (id: string | null) => {
    state = { ...state, user: { ...state.user, currentMallId: id } };
    listeners.forEach((l) => l());
  },
  spendPoints: (pts: number) => {
    state = { ...state, user: { ...state.user, points: Math.max(0, state.user.points - pts) } };
    listeners.forEach((l) => l());
  },
  earnPoints: (pts: number) => {
    state = {
      ...state,
      user: {
        ...state.user,
        points: state.user.points + pts,
        lifetimePoints: state.user.lifetimePoints + pts,
      },
    };
    listeners.forEach((l) => l());
  },
  setUser: (patch: { name: string; initial: string }) => {
    state = { ...state, user: { ...state.user, ...patch } };
    listeners.forEach((l) => l());
  },
  subscribe: (fn: () => void) => {
    listeners.push(fn);
    return () => { listeners = listeners.filter((l) => l !== fn); };
  },
};

export function useMockStore() {
  return useSyncExternalStore(mockStore.subscribe, mockStore.get, mockStore.get);
}

export function useTier() {
  const s = useMockStore();
  return tierFromLifetime(s.user.lifetimePoints);
}

export type { MockTx };
