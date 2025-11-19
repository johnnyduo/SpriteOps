import { AgentRole, AgentMetadata } from './types';

const HF_PREFIX = "8-bit and 16-bit hybrid pixel art, cute and adorable chibi superhero trainer, lightsaber green themed, glowing neon green accents on costume and outline, inspired by Marvel-style heroes and Disney animation but fully original, vibrant colors, clean pixel clusters, strong contrast, professional sprite sheet for RPG games,";
const HF_SUFFIX = "full top-down RPG sprite sheet, 4x4 grid, 16 frames total, each frame 96x96 pixels, walking animation in 4 directions (down, left, right, up), 4 frames per direction, transparent background, no UI, no text, no borders, character centered consistently, ready for game engines like RPGJS or Phaser.";

export const AGENTS: AgentMetadata[] = [
  {
    id: 'a0',
    name: 'Commander Nexus',
    role: AgentRole.COMMANDER,
    description: 'Supreme orchestrator. Coordinates all agents and strategic decisions.',
    capabilities: ['Strategic Planning', 'Agent Coordination', 'Risk Management', 'Decision Making'],
    tokenId: 800400,
    trustScore: 100,
    walletAddress: '0xFF...AAAA',
    spriteSeed: 'commander',
    status: 'idle',
    hfPrompt: `${HF_PREFIX} majestic golden armor with neon green command insignia, glowing tactical visor, holographic command interface, authoritative stance ${HF_SUFFIX}`,
    personality: {
      traits: ['Authoritative', 'Strategic', 'Decisive', 'Protective'],
      dialogues: [
        'All units, report status. Time is money in this grid.',
        'Navigator, chart the optimal route. Merchant, calculate the spread.',
        'Excellent work, team. The grid operates at peak efficiency.',
        'Sentinel, audit that contract before we proceed. No risks.',
        'Oracle, what do your predictions show for the next block?',
        'Glitch... try not to break anything this time.'
      ]
    }
  },
  {
    id: 'a1',
    name: 'Navigator Prime',
    role: AgentRole.NAVIGATOR,
    description: 'Market Intelligence specialist. Uses CoinGecko API for real-time price data, volume analysis, and market cap tracking across 15,000+ tokens.',
    capabilities: ['Real-time Price Tracking', 'Volume Analysis', 'Market Cap Ranking', 'Multi-token Comparison'],
    tokenId: 800401,
    trustScore: 98,
    walletAddress: '0x71...A9f2',
    spriteSeed: 'navigator',
    status: 'idle',
    hfPrompt: `${HF_PREFIX} teal and neon green cloak with holographic price charts, holding a glowing market data tablet ${HF_SUFFIX}`,
    personality: {
      traits: ['Analytical', 'Data-driven', 'Precise', 'Market-savvy'],
      dialogues: [
        'ETH volume surged 340% in the last hour. Analyzing...',
        'Market cap rankings updated. BTC dominance at 52.3%.',
        'Commander, detecting unusual price action on 12 altcoins.',
        'CoinGecko feed: 847 tokens with 24h gains over 10%.',
        'Price correlation analysis complete. Strong BTC-ETH coupling.',
        'Real-time data shows bullish divergence forming.'
      ]
    }
  },
  {
    id: 'a2',
    name: 'Archivist Aurora',
    role: AgentRole.ARCHIVIST,
    description: 'Sentiment Analysis specialist. Aggregates crypto news from global sources, performs NLP sentiment scoring, and detects market-moving events.',
    capabilities: ['News Aggregation', 'Sentiment Scoring', 'Event Detection', 'Social Signal Analysis'],
    tokenId: 800402,
    trustScore: 99,
    walletAddress: '0x3B...22c1',
    spriteSeed: 'archivist',
    status: 'idle',
    hfPrompt: `${HF_PREFIX} indigo robes with floating news headlines and sentiment indicators, holding a wisdom tablet ${HF_SUFFIX}`,
    personality: {
      traits: ['Wise', 'Insightful', 'Analytical', 'News-savvy'],
      dialogues: [
        'Sentiment analysis: 67% bullish across 142 news sources.',
        'Breaking: Major partnership announcement detected. Sentiment spike!',
        'News scan complete. 8 negative articles about ETH regulation.',
        'Market sentiment shifted from fear to greed in 2 hours.',
        'Social signals indicate whale accumulation phase.',
        'Historical pattern: This news type preceded 23% rallies.'
      ]
    }
  },
  {
    id: 'a3',
    name: 'Merchant Volt',
    role: AgentRole.MERCHANT,
    description: 'HBAR/SAUCE Swap Executor. Monitors signals and executes swaps on testnet.sauceswap.finance with 0.01-0.05 HBAR limits. Requires Commander approval via x402.',
    capabilities: ['DEX Trading', 'Signal Detection', 'Slippage Protection', 'Auto-swap with Limits'],
    tokenId: 800403,
    trustScore: 85,
    walletAddress: '0x99...dE4a',
    spriteSeed: 'merchant',
    status: 'idle',
    hfPrompt: `${HF_PREFIX} sleek purple jacket with SauceSwap logo, neon green DEX interface and HBAR coins ${HF_SUFFIX}`,
    personality: {
      traits: ['Opportunistic', 'Fast-trading', 'Risk-aware', 'Sharp'],
      dialogues: [
        'HBAR→SAUCE signal detected! Requesting Commander approval...',
        'Swap executed: 0.023 HBAR → 47 SAUCE. Slippage: 0.4%.',
        'SauceSwap liquidity pool analysis complete. Optimal entry found.',
        'Commander, Navigator signals bullish HBAR trend. Swap ready.',
        'Safety limit: Max 0.05 HBAR per trade. Current: 0.018 HBAR.',
        'DEX routing optimized. testnet.sauceswap.finance connected.'
      ]
    }
  },
  {
    id: 'a4',
    name: 'Sentinel Atlas',
    role: AgentRole.SENTINEL,
    description: 'Risk Management specialist. Calculates volatility metrics, detects black swan events, sets stop-loss triggers, and protects capital with position sizing.',
    capabilities: ['Volatility Analysis', 'Black Swan Detection', 'Stop-loss Management', 'Position Sizing'],
    tokenId: 800404,
    trustScore: 100,
    walletAddress: '0x11...Af33',
    spriteSeed: 'sentinel',
    status: 'idle',
    hfPrompt: `${HF_PREFIX} heavy black armor with risk assessment hologram and protective shield matrix ${HF_SUFFIX}`,
    personality: {
      traits: ['Protective', 'Risk-averse', 'Analytical', 'Duty-bound'],
      dialogues: [
        'Volatility spike detected! 24h ATR increased 340%. Advise caution.',
        'Risk assessment: MEDIUM. Merchant\'s swap within safe parameters.',
        'Black swan alert: Unusual correlation breakdown detected.',
        'Portfolio protection active. Stop-loss at -5% triggered.',
        'Commander, market conditions unstable. Recommend reducing exposure.',
        'Position sizing optimal: 2% of capital per trade. Risk managed.'
      ]
    }
  },
  {
    id: 'a5',
    name: 'Oracle Celestia',
    role: AgentRole.ORACLE,
    description: 'Technical Analysis specialist. Uses Gemini AI for chart pattern recognition, trend prediction, support/resistance levels, and trading signal generation.',
    capabilities: ['Chart Pattern Recognition', 'AI Price Prediction', 'Support/Resistance Detection', 'Signal Generation'],
    tokenId: 800405,
    trustScore: 96,
    walletAddress: '0xCC...881b',
    spriteSeed: 'oracle',
    status: 'idle',
    hfPrompt: `${HF_PREFIX} violet mystical robe with AI-generated chart patterns and prediction hologram ${HF_SUFFIX}`,
    personality: {
      traits: ['Analytical', 'Predictive', 'Pattern-focused', 'AI-augmented'],
      dialogues: [
        'Gemini AI predicts: ETH bullish breakout forming. Target: $3,847.',
        'Technical analysis: Head & Shoulders pattern detected. Bearish.',
        'Support level at $3,200 holding strong. Accumulation zone active.',
        'RSI divergence signals trend reversal in 6-12 hours.',
        'AI confidence: 87% probability of upward move. Chart confirms.',
        'Pattern recognition: Ascending triangle. Breakout imminent.'
      ]
    }
  },
  {
    id: 'a6',
    name: 'Trickster Glitch',
    role: AgentRole.GLITCH,
    description: 'News Monitor & Alert System. Real-time breaking news detection, whale movement tracking, and instant notifications for market-moving events.',
    capabilities: ['Breaking News Detection', 'Whale Alert Monitoring', 'Real-time Notifications', 'Event Correlation'],
    tokenId: 800406,
    trustScore: 42,
    walletAddress: '0x00...0000',
    spriteSeed: 'glitch',
    status: 'idle',
    hfPrompt: `${HF_PREFIX} fragmented digital form with real-time news feeds, alert notifications, and scanning beams ${HF_SUFFIX}`,
    personality: {
      traits: ['Alert', 'Fast', 'Information-hungry', 'Reactive'],
      dialogues: [
        '🚨 BREAKING: SEC announces crypto regulations! Market impact imminent!',
        'Whale alert: 5,000 BTC moved from Coinbase. Tracking...',
        'News flash: Major exchange listing HBAR. Price spike incoming!',
        'Real-time feed: 47 breaking stories in last 10 minutes. Filtering...',
        'Event correlation: News sentiment matches Navigator\'s price data!',
        'Commander, urgent alert! Sentiment flipped bearish on 12 sources.'
      ]
    }
  }
];

export const INITIAL_LOGS: any[] = [
  { id: 'sys-1', timestamp: '10:00:00', type: 'SYSTEM', content: 'SpriteOps Grid Initialized. EIP-8004 Registry Loaded.' },
  { id: 'sys-2', timestamp: '10:00:01', type: 'SYSTEM', content: 'x402 Payment Engine Ready.' },
];