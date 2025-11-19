// Reown AppKit Configuration for Hedera Testnet
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { defineChain } from 'viem';
import { QueryClient } from '@tanstack/react-query';

// Hedera Testnet Chain Configuration
export const hederaTestnet = defineChain({
  id: 296,
  name: 'Hedera Testnet',
  nativeCurrency: {
    name: 'HBAR',
    symbol: 'HBAR',
    decimals: 18
  },
  rpcUrls: {
    default: { http: ['https://testnet.hashio.io/api'] },
    public: { http: ['https://testnet.hashio.io/api'] }
  },
  blockExplorers: {
    default: {
      name: 'HashScan',
      url: 'https://hashscan.io/testnet'
    }
  },
  testnet: true
});

// USDC Token on Hedera Testnet
export const USDC_ADDRESS = '0x340e7949d378C6d6eB1cf7391F5C39b6c826BA9d';

// Reown Project ID from environment
const projectId = (import.meta as any).env?.VITE_REOWN_PROJECT_ID || 'c97c2ccda03a64c922bf2d188b6219f7';

// Query Client for React Query
export const queryClient = new QueryClient();

// Wagmi Configuration
export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [hederaTestnet],
  ssr: false
});

// Create AppKit instance
export const modal = createAppKit({
  adapters: [wagmiAdapter],
  networks: [hederaTestnet],
  projectId,
  features: {
    analytics: true,
    email: false,
    socials: []
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#39ff14',
    '--w3m-color-mix': '#050505',
    '--w3m-color-mix-strength': 40
  }
});

export const config = wagmiAdapter.wagmiConfig;

// Make modal available globally for easy access
if (typeof window !== 'undefined') {
  (window as any).modal = modal;
}
