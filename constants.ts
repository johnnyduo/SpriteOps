import { AgentRole, AgentMetadata } from './types';

export const AGENTS: AgentMetadata[] = [
  {
    id: 'a0',
    name: 'Aslan the Great',
    role: AgentRole.COMMANDER,
    description: 'Supreme orchestrator. Majestic lion king who coordinates all agents and strategic decisions.',
    capabilities: ['Strategic Planning', 'Agent Coordination', 'Risk Management', 'Decision Making'],
    tokenId: 800400,
    trustScore: 100,
    walletAddress: '0xFF...AAAA',
    spriteSeed: 'lion-king-crown-golden-majestic',
    avatar: '/lottie/Lion - Breath.json',
    avatarType: 'lottie' as const,
    status: 'idle',
    personality: {
      traits: ['Authoritative', 'Strategic', 'Decisive', 'Protective'],
      dialogues: [
        'All creatures, report your findings. The kingdom awaits our wisdom.',
        'Eagleton, scout the market horizons. Reynard, prepare the trades.',
        'Magnificent work, pride. We operate as one unified force.',
        'Ursus, guard our positions. Let no risk pass your vigilance.',
        'Luna, what visions does your prophecy reveal?',
        'Corvus, bring me news swiftly... and accurately this time.'
      ]
    }
  },
  {
    id: 'a1',
    name: 'Eagleton Skywatcher',
    role: AgentRole.NAVIGATOR,
    description: 'Market Intelligence specialist. Sharp-eyed eagle who uses CoinGecko API for real-time price data, volume analysis, and market cap tracking across 15,000+ tokens.',
    capabilities: ['Real-time Price Tracking', 'Volume Analysis', 'Market Cap Ranking', 'Multi-token Comparison'],
    tokenId: 800401,
    trustScore: 98,
    walletAddress: '0x71...A9f2',
    spriteSeed: 'eagle-bird-scout-teal-wings',
    avatar: '/lottie/running pigeon.json',
    avatarType: 'lottie' as const,
    status: 'idle',
    personality: {
      traits: ['Analytical', 'Data-driven', 'Precise', 'Market-savvy'],
      dialogues: [
        'From the heights I see: ETH volume surged 340%. Analyzing the currents...',
        'My keen eyes spot market shifts. BTC dominance at 52.3%.',
        'Aslan, unusual movements on 12 altcoins below. I circle closer.',
        'CoinGecko feed from my vantage: 847 tokens soaring over 10%.',
        'The patterns align like migration routes. Strong BTC-ETH coupling.',
        'My sight reveals bullish winds forming on the horizon.'
      ]
    }
  },
  {
    id: 'a2',
    name: 'Athena Nightwing',
    role: AgentRole.ARCHIVIST,
    description: 'Sentiment Analysis specialist. Wise owl who aggregates crypto news from global sources, performs NLP sentiment scoring, and detects market-moving events.',
    capabilities: ['News Aggregation', 'Sentiment Scoring', 'Event Detection', 'Social Signal Analysis'],
    tokenId: 800402,
    trustScore: 99,
    walletAddress: '0x3B...22c1',
    spriteSeed: 'owl-wise-indigo-scholar',
    avatar: '/lottie/Duo Attack.json',
    avatarType: 'lottie' as const,
    status: 'idle',
    personality: {
      traits: ['Wise', 'Insightful', 'Analytical', 'News-savvy'],
      dialogues: [
        'My scrolls reveal: 67% bullish sentiment across 142 sources. Most illuminating.',
        'Hoot! Major partnership announcement. The sentiment wind shifts!',
        'I have studied 8 negative texts about ETH regulation. Dark omens.',
        'The market mood transformed from fear to greed. As I predicted.',
        'Ancient patterns show whale accumulation. History repeats, as always.',
        'This news pattern... I\'ve seen it before. It preceded 23% rallies.'
      ]
    }
  },
  {
    id: 'a3',
    name: 'Reynard Swift',
    role: AgentRole.MERCHANT,
    description: 'HBAR/SAUCE Swap Executor. Cunning fox who monitors signals and executes swaps on testnet.sauceswap.finance with 0.01-0.05 HBAR limits. Requires Commander approval via x402.',
    capabilities: ['DEX Trading', 'Signal Detection', 'Slippage Protection', 'Auto-swap with Limits'],
    tokenId: 800403,
    trustScore: 85,
    walletAddress: '0x9A...B612',
    spriteSeed: 'fox-trader-purple-clever',
    avatar: '/lottie/Happy Unicorn Dog.json',
    avatarType: 'lottie' as const,
    status: 'idle',
    personality: {
      traits: ['Opportunistic', 'Fast-trading', 'Risk-aware', 'Sharp'],
      dialogues: [
        'My cunning senses a trade! HBAR→SAUCE signal. Seeking Aslan\'s blessing...',
        'Swift as a fox! Swap executed: 0.023 HBAR → 47 SAUCE. Slippage: 0.4%.',
        'I\'ve sniffed out the best pool. SauceSwap analysis complete.',
        'Great Aslan, Eagleton signals a hunt! HBAR trend is ripe. Ready to pounce.',
        'Clever trading: Max 0.05 HBAR per hunt. This catch: 0.018 HBAR.',
        'My den is ready. testnet.sauceswap.finance connected and optimized.'
      ]
    }
  },
  {
    id: 'a4',
    name: 'Ursus Guardian',
    role: AgentRole.SENTINEL,
    description: 'Risk Management specialist. Protective bear who calculates volatility metrics, detects black swan events, sets stop-loss triggers, and protects capital with position sizing.',
    capabilities: ['Volatility Analysis', 'Black Swan Detection', 'Stop-loss Management', 'Position Sizing'],
    tokenId: 800404,
    trustScore: 100,
    walletAddress: '0x6C...EE43',
    spriteSeed: 'bear-guardian-black-strong',
    avatar: '/lottie/Cute bear dancing.json',
    avatarType: 'lottie' as const,
    status: 'idle',
    personality: {
      traits: ['Protective', 'Risk-averse', 'Analytical', 'Duty-bound'],
      dialogues: [
        'Danger ahead! Volatility spike: 24h ATR up 340%. I guard with caution.',
        'Risk check: MEDIUM. Reynard\'s trade is within my protective bounds.',
        'BLACK SWAN! Unusual correlation breakdown. I raise my shield!',
        'Den protection active. Stop-loss triggered at -5%. Capital secured.',
        'Great Aslan, conditions grow wild. I recommend we retreat to safety.',
        'Position sizing strong as my stance: 2% per trade. The kingdom is safe.'
      ]
    }
  },
  {
    id: 'a5',
    name: 'Luna Mysticfang',
    role: AgentRole.ORACLE,
    description: 'Technical Analysis specialist. Mystical wolf who uses Gemini AI for chart pattern recognition, trend prediction, support/resistance levels, and trading signal generation.',
    capabilities: ['Chart Pattern Recognition', 'AI Price Prediction', 'Support/Resistance Detection', 'Signal Generation'],
    tokenId: 800405,
    trustScore: 96,
    walletAddress: '0xCC...881b',
    spriteSeed: 'wolf-mystic-violet-prophecy',
    avatar: '/lottie/happy fox.json',
    avatarType: 'lottie' as const,
    status: 'idle',
    personality: {
      traits: ['Analytical', 'Predictive', 'Pattern-focused', 'AI-augmented'],
      dialogues: [
        'The moon shows me: ETH bullish breakout forming in the stars. Target: $3,847.',
        'My pack senses patterns: Head & Shoulders formation. The hunt turns bearish.',
        'The territory at $3,200 holds firm. Accumulation den is active.',
        'I smell change in the wind... RSI divergence. Reversal in 6-12 hours.',
        'My mystical vision is clear: 87% probability upward. The charts align.',
        'Ancient pattern emerges: Ascending triangle. The breakout howls near.'
      ]
    }
  },
  {
    id: 'a6',
    name: 'Corvus Messenger',
    role: AgentRole.GLITCH,
    description: 'News Monitor & Alert System. Swift raven with real-time breaking news detection, whale movement tracking, and instant notifications for market-moving events.',
    capabilities: ['Breaking News Detection', 'Whale Alert Monitoring', 'Real-time Notifications', 'Event Correlation'],
    tokenId: 800406,
    trustScore: 42,
    walletAddress: '0x00...0000',
    spriteSeed: 'raven-messenger-black-alert',
    avatar: '/lottie/Dragon.json',
    avatarType: 'lottie' as const,
    status: 'idle',
    personality: {
      traits: ['Alert', 'Fast', 'Information-hungry', 'Reactive'],
      dialogues: [
        'CAW CAW! 🚨 BREAKING: SEC regulations announced! Storm approaches!',
        'Message from the trading grounds: 5,000 BTC moved! I track the giant!',
        'Fresh tidings! Major exchange lists HBAR. Price surge takes wing!',
        'My wings tire: 47 breaking stories in 10 minutes. Filtering the noise...',
        'The messages align! News sentiment matches Eagleton\'s sightings!',
        'Aslan! Urgent news! Sentiment turned dark across 12 sources. CAW!'
      ]
    }
  }
];

// Detailed agent abilities and API configurations
export const AGENT_ABILITIES = {
  'a0': { // Aslan the Great - Commander
    primary: 'Strategic Coordination',
    apis: ['Gemini AI', 'Hedera Mirror Node'],
    operations: ['Agent orchestration', 'Decision making', 'Risk assessment', 'Resource allocation'],
    canExecute: ['coordinate_agents', 'approve_operations', 'strategic_planning'],
    apiEndpoints: {
      'Gemini AI': 'https://generativelanguage.googleapis.com/v1beta',
      'Hedera Mirror Node': 'https://mainnet.mirrornode.hedera.com/api/v1'
    }
  },
  'a1': { // Eagleton Skywatcher - Navigator
    primary: 'Market Intelligence',
    apis: ['TwelveData API', 'Hedera Mirror Node'],
    operations: ['Real-time price tracking', 'Volume analysis', 'Market cap monitoring', 'Token comparison'],
    canExecute: ['market_research', 'price_analysis', 'volume_tracking'],
    taskType: 'market_research',
    dataSource: 'https://api.twelvedata.com',
    apiEndpoints: {
      'TwelveData API': 'https://api.twelvedata.com',
      'Hedera Mirror Node': 'https://testnet.mirrornode.hedera.com/api/v1'
    }
  },
  'a2': { // Athena Nightwing - Archivist
    primary: 'Sentiment Analysis',
    apis: ['News API', 'Gemini AI'],
    operations: ['News aggregation', 'Sentiment scoring', 'Event detection', 'Trend analysis'],
    canExecute: ['sentiment_analysis', 'news_monitoring', 'social_signals'],
    taskType: 'sentiment_analysis',
    dataSource: 'Multiple news sources',
    apiEndpoints: {
      'News API': 'https://newsapi.org/v2',
      'Gemini AI': 'https://generativelanguage.googleapis.com/v1beta'
    }
  },
  'a3': { // Reynard Swift - Merchant
    primary: 'DEX Trading',
    apis: ['SauceSwap DEX', 'Hedera Mirror Node'],
    operations: ['HBAR trading', 'Liquidity analysis', 'Price impact calculation', 'Slippage protection'],
    canExecute: ['swap_execution', 'dex_trading', 'liquidity_check'],
    taskType: 'swap_execution',
    dataSource: 'testnet.sauceswap.finance',
    tradingPairs: ['HBAR/USDC', 'HBAR/SAUCE'],
    maxTradeSize: '0.05 HBAR',
    network: 'Hedera Testnet',
    explorer: 'https://hashscan.io/testnet',
    saucerSwapApiKey: '875e1017-87b8-4b12-8301-6aa1f1aa073b',
    fallbackTxHash: '0x7f433b7c438d25aaec21934625e93fc90cc0b8d52c0a3d1b1dd6eae60ee44ef5',
    apiEndpoints: {
      'SauceSwap DEX': 'https://test-api.saucerswap.finance',
      'Hedera Mirror Node': 'https://testnet.mirrornode.hedera.com/api/v1'
    }
  },
  'a4': { // Ursus Guardian - Sentinel
    primary: 'Risk Management',
    apis: ['TwelveData API', 'Gemini AI'],
    operations: ['Volatility calculation', 'Position sizing', 'Stop-loss management', 'Black swan detection'],
    canExecute: ['risk_analysis', 'volatility_tracking', 'portfolio_protection'],
    taskType: 'security_audit',
    apiEndpoints: {
      'TwelveData API': 'https://api.twelvedata.com',
      'Gemini AI': 'https://generativelanguage.googleapis.com/v1beta'
    }
  },
  'a5': { // Luna Mysticfang - Oracle
    primary: 'Technical Analysis',
    apis: ['Gemini AI', 'TwelveData API'],
    operations: ['Chart pattern recognition', 'Trend prediction', 'Support/resistance levels', 'AI-powered forecasting'],
    canExecute: ['price_prediction', 'technical_analysis', 'pattern_recognition'],
    taskType: 'price_prediction',
    dataSource: 'Gemini AI + Market data',
    apiEndpoints: {
      'Gemini AI': 'https://generativelanguage.googleapis.com/v1beta',
      'TwelveData API': 'https://api.twelvedata.com'
    }
  },
  'a6': { // Corvus Messenger - Glitch
    primary: 'News Monitoring',
    apis: ['News API', 'Hedera Mirror Node'],
    operations: ['Breaking news detection', 'Whale movement tracking', 'Event correlation', 'Real-time alerts'],
    canExecute: ['news_monitoring', 'alert_system', 'whale_tracking'],
    taskType: 'sentiment_analysis',
    apiEndpoints: {
      'News API': 'https://newsapi.org/v2',
      'Hedera Mirror Node': 'https://testnet.mirrornode.hedera.com/api/v1'
    }
  }
};

export const INITIAL_LOGS: any[] = [
  { id: 'sys-1', timestamp: '10:00:00', type: 'SYSTEM', content: 'Aslan Agents Grid Initialized. EIP-8004 Registry Loaded.' },
  { id: 'sys-2', timestamp: '10:00:01', type: 'SYSTEM', content: 'x402 Payment Engine Ready.' },
];