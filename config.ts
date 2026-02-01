// config.ts
import { rpc } from "./providers";

export const CHAINS = {
  ethereum: {
    chainId: "0x1",
    rpc: rpc("ethereum"),
    name: "Ethereum Mainnet",
    symbol: "ETH",
  },
  polygon: {
    chainId: "0x89",
    rpc: rpc("polygon"),
    name: "Polygon Mainnet",
    symbol: "MATIC",
  },
  bnb: {
    chainId: "0x38",
    rpc: rpc("bsc"),
    name: "BNB Smart Chain",
    symbol: "BNB",
  },
  arbitrum: {
    chainId: "0xa4b1",
    rpc: rpc("arbitrum"),
    name: "Arbitrum One",
    symbol: "ETH",
  },
  base: {
    chainId: "0x2105",
    rpc: rpc("base"),
    name: "Base Mainnet",
    symbol: "ETH",
  },
} as const;

export type ChainKey = keyof typeof CHAINS;