// API Service Layer for SPRITEOPS
// Integrates: Gemini AI, TwelveData, News API, and Hedera Mirror Node

import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = (import.meta as any).env?.GEMINI_API_KEY || '';
const TWELVEDATA_API_KEY = (import.meta as any).env?.TWELVEDATA_API_KEY || '';
const NEWS_API_KEY = (import.meta as any).env?.NEWS_API_KEY || '';
const HEDERA_MIRROR_NODE_URL = (import.meta as any).env?.HEDERA_MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com/api/v1';

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ===========================
// SMART CACHING LAYER
// ===========================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class SmartCache {
  private prefix = 'spriteops_cache_';

  set<T>(key: string, data: T, ttlSeconds: number = 300): void {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + (ttlSeconds * 1000)
      };
      localStorage.setItem(this.prefix + key, JSON.stringify(entry));
    } catch (e) {
      console.warn('Cache write failed:', e);
    }
  }

  get<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(this.prefix + key);
      if (!item) return null;

      const entry: CacheEntry<T> = JSON.parse(item);
      
      // Check if expired
      if (Date.now() > entry.expiresAt) {
        this.delete(key);
        return null;
      }

      return entry.data;
    } catch (e) {
      console.warn('Cache read failed:', e);
      return null;
    }
  }

  delete(key: string): void {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch (e) {
      console.warn('Cache delete failed:', e);
    }
  }

  clear(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn('Cache clear failed:', e);
    }
  }
}

const cache = new SmartCache();

// ===========================
// API RATE LIMITER
// ===========================

class RateLimiter {
  private calls: Record<string, number[]> = {};
  private limits: Record<string, { maxCalls: number; windowMs: number }> = {
    gemini: { maxCalls: 10, windowMs: 60000 }, // 10 calls per minute
    coingecko: { maxCalls: 30, windowMs: 60000 }, // 30 calls per minute
    news: { maxCalls: 20, windowMs: 60000 } // 20 calls per minute
  };

  canMakeCall(service: string): boolean {
    const now = Date.now();
    const limit = this.limits[service];
    
    if (!limit) return true; // No limit defined

    // Initialize if needed
    if (!this.calls[service]) {
      this.calls[service] = [];
    }

    // Remove old calls outside the window
    this.calls[service] = this.calls[service].filter(
      timestamp => now - timestamp < limit.windowMs
    );

    // Check if we can make a new call
    return this.calls[service].length < limit.maxCalls;
  }

  recordCall(service: string): void {
    const now = Date.now();
    if (!this.calls[service]) {
      this.calls[service] = [];
    }
    this.calls[service].push(now);
  }

  getRemainingCalls(service: string): number {
    const limit = this.limits[service];
    if (!limit) return Infinity;

    const now = Date.now();
    if (!this.calls[service]) return limit.maxCalls;

    const recentCalls = this.calls[service].filter(
      timestamp => now - timestamp < limit.windowMs
    );

    return Math.max(0, limit.maxCalls - recentCalls.length);
  }

  getTimeUntilReset(service: string): number {
    const limit = this.limits[service];
    if (!limit || !this.calls[service] || this.calls[service].length === 0) {
      return 0;
    }

    const now = Date.now();
    const oldestCall = Math.min(...this.calls[service]);
    const resetTime = oldestCall + limit.windowMs;
    
    return Math.max(0, resetTime - now);
  }
}

const rateLimiter = new RateLimiter();

// ===========================
// GEMINI AI SERVICE
// ===========================

export interface GeminiRequest {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GeminiResponse {
  text: string;
  candidates?: any[];
  error?: string;
}

export const geminiService = {
  async chat(request: GeminiRequest): Promise<GeminiResponse> {
    if (!GEMINI_API_KEY) {
      console.warn('Gemini API key not configured');
      return { text: 'API key not configured', error: 'MISSING_API_KEY' };
    }

    // Check rate limit
    if (!rateLimiter.canMakeCall('gemini')) {
      const waitTime = Math.ceil(rateLimiter.getTimeUntilReset('gemini') / 1000);
      console.warn(`⏳ Gemini rate limit reached. Wait ${waitTime}s. Remaining calls: ${rateLimiter.getRemainingCalls('gemini')}`);
      return { 
        text: `Rate limit: ${rateLimiter.getRemainingCalls('gemini')} calls remaining`, 
        error: 'RATE_LIMITED' 
      };
    }

    try {
      rateLimiter.recordCall('gemini');
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: request.prompt,
      });
      
      const text = response.text || 'No response';
      
      return { text };
    } catch (error: any) {
      // Handle specific error cases
      let errorMessage = 'AI service temporarily unavailable';
      let shouldLogError = true;
      
      if (error?.message?.includes('overloaded') || error?.error?.message?.includes('overloaded')) {
        errorMessage = 'AI service is busy, please try again';
        shouldLogError = false;
      } else if (error?.message?.includes('quota') || error?.message?.includes('429')) {
        errorMessage = 'Daily quota exceeded - AI disabled until reset';
        shouldLogError = true;
        console.error('🚨 GEMINI QUOTA EXCEEDED - Disabling AI calls');
      } else if (error?.message?.includes('UNAVAILABLE') || error?.error?.status === 'UNAVAILABLE') {
        errorMessage = 'AI service temporarily down';
        shouldLogError = false;
      }
      
      if (shouldLogError) {
        console.error('Gemini API error:', error);
      } else {
        console.warn('Gemini API:', errorMessage);
      }
      
      return { 
        text: errorMessage, 
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR' 
      };
    }
  },

  // Agent-specific intelligence queries with caching
  async analyzeMarket(symbol: string, data: any): Promise<string> {
    // Cache key based on symbol and price (rounded to reduce cache misses)
    const priceRounded = Math.round(data.price / 10) * 10; // Round to nearest $10
    const cacheKey = `market_analysis_${symbol}_${priceRounded}`;
    
    // Check cache first (5 minutes TTL)
    const cached = cache.get<string>(cacheKey);
    if (cached) {
      return cached;
    }

    const prompt = `As a crypto market analyst, analyze ${symbol} with the following data: ${JSON.stringify(data)}. Provide a concise 2-sentence market insight.`;
    const response = await this.chat({ prompt, temperature: 0.5 });
    
    // Cache successful responses
    if (response.text && !response.error) {
      cache.set(cacheKey, response.text, 300); // 5 minutes
    }
    
    return response.text;
  },

  async generateStrategy(agentRole: string, context: string): Promise<string> {
    // Don't cache strategies - they should be dynamic
    // But check rate limit before calling
    if (!rateLimiter.canMakeCall('gemini')) {
      return 'Systems monitoring. Standing by for next opportunity.';
    }

    const prompt = `You are a ${agentRole} agent in a decentralized AI network. Given context: ${context}. Suggest the next optimal action in 1 sentence.`;
    const response = await this.chat({ prompt, temperature: 0.8 });
    return response.text;
  }
};

// ===========================
// COINGECKO CRYPTO SERVICE (PRIMARY)
// ===========================

export interface CryptoPriceData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  high24h?: number;
  low24h?: number;
  timestamp: number;
  error?: string;
}

export const coingeckoService = {
  async getMarketData(coinId: string = 'ethereum'): Promise<CryptoPriceData> {
    const cacheKey = `coingecko_${coinId}`;
    
    // Check cache first (2 minutes TTL for market data)
    const cached = cache.get<CryptoPriceData>(cacheKey);
    if (cached) {
      return cached;
    }

    // Check rate limit
    if (!rateLimiter.canMakeCall('coingecko')) {
      console.warn('⏳ CoinGecko rate limit reached, using fallback');
      return this._getFallbackPrice(coinId);
    }

    try {
      rateLimiter.recordCall('coingecko');
      
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const marketData = data.market_data;
      
      const result: CryptoPriceData = {
        symbol: data.symbol.toUpperCase(),
        price: marketData.current_price.usd,
        change: marketData.price_change_24h,
        changePercent: marketData.price_change_percentage_24h,
        volume: marketData.total_volume.usd,
        marketCap: marketData.market_cap.usd,
        high24h: marketData.high_24h.usd,
        low24h: marketData.low_24h.usd,
        timestamp: Date.now()
      };

      // Cache the result (2 minutes)
      cache.set(cacheKey, result, 120);
      
      return result;
    } catch (error) {
      console.error('CoinGecko error:', error);
      return this._getFallbackPrice(coinId);
    }
  },

  async getSimplePrice(coinIds: string[]): Promise<Record<string, any>> {
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('CoinGecko simple price error:', error);
      return {};
    }
  },

  _getFallbackPrice(coinId: string): CryptoPriceData {
    const basePrices: Record<string, { price: number; symbol: string }> = {
      'ethereum': { price: 3052, symbol: 'ETH' },
      'bitcoin': { price: 42000, symbol: 'BTC' },
      'solana': { price: 85, symbol: 'SOL' },
      'hedera-hashgraph': { price: 0.08, symbol: 'HBAR' }
    };

    const base = basePrices[coinId] || { price: 100, symbol: coinId.toUpperCase() };
    const price = base.price + (Math.random() - 0.5) * base.price * 0.02;
    const changePercent = (Math.random() - 0.5) * 5;
    
    return {
      symbol: base.symbol,
      price,
      change: (price * changePercent) / 100,
      changePercent,
      volume: price * 1e9,
      marketCap: price * 120e6,
      high24h: price * 1.05,
      low24h: price * 0.95,
      timestamp: Date.now()
    };
  }
};

// ===========================
// TWELVEDATA CRYPTO SERVICE (LEGACY)
// ===========================

export const cryptoService = {
  async getPrice(symbol: string = 'ETH/USD'): Promise<CryptoPriceData> {
    if (!TWELVEDATA_API_KEY) {
      console.warn('TwelveData API key not configured');
      return this._getFallbackPrice(symbol);
    }

    try {
      const response = await fetch(
        `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${TWELVEDATA_API_KEY}`
      );

      if (!response.ok) {
        throw new Error(`TwelveData API error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        symbol,
        price: parseFloat(data.price),
        change: 0, // Need time series for change
        changePercent: 0,
        volume: 0,
        marketCap: 0,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('TwelveData error:', error);
      return this._getFallbackPrice(symbol);
    }
  },

  async getTimeSeries(symbol: string = 'ETH/USD', interval: string = '5min'): Promise<any> {
    if (!TWELVEDATA_API_KEY) {
      return { error: 'API key not configured' };
    }

    try {
      const response = await fetch(
        `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&outputsize=12&apikey=${TWELVEDATA_API_KEY}`
      );

      if (!response.ok) {
        throw new Error(`TwelveData API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('TwelveData time series error:', error);
      return { error: error instanceof Error ? error.message : 'UNKNOWN_ERROR' };
    }
  },

  async getMultiplePrices(symbols: string[]): Promise<CryptoPriceData[]> {
    return Promise.all(symbols.map(symbol => this.getPrice(symbol)));
  },

  _getFallbackPrice(symbol: string): CryptoPriceData {
    // Simulated fallback data
    const basePrices: Record<string, number> = {
      'ETH/USD': 2400 + Math.random() * 200,
      'BTC/USD': 42000 + Math.random() * 2000,
      'SOL/USD': 85 + Math.random() * 10,
      'HBAR/USD': 0.08 + Math.random() * 0.02
    };

    const price = basePrices[symbol] || 100 + Math.random() * 50;
    const change = (Math.random() - 0.5) * 10;
    
    return {
      symbol,
      price,
      change,
      changePercent: (change / price) * 100,
      volume: price * 1e9,
      marketCap: price * 120e6,
      timestamp: Date.now()
    };
  }
};

// ===========================
// NEWS SENTIMENT SERVICE
// ===========================

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  source: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface NewsSentiment {
  articles: NewsArticle[];
  overallSentiment: 'bullish' | 'bearish' | 'neutral';
  score: number; // -1 to 1
  error?: string;
}

export const newsService = {
  async getCryptoNews(query: string = 'cryptocurrency'): Promise<NewsSentiment> {
    const cacheKey = `news_${query}`;
    
    // Check cache first (10 minutes TTL for news)
    const cached = cache.get<NewsSentiment>(cacheKey);
    if (cached) {
      return cached;
    }

    if (!NEWS_API_KEY) {
      console.warn('News API key not configured');
      return this._getFallbackNews();
    }

    // Check rate limit
    if (!rateLimiter.canMakeCall('news')) {
      console.warn('⏳ News API rate limit reached, using fallback');
      return this._getFallbackNews();
    }

    try {
      rateLimiter.recordCall('news');
      
      const response = await fetch(
        `https://newsapi.org/v2/everything?q=${query}&sortBy=publishedAt&pageSize=10&apiKey=${NEWS_API_KEY}`
      );

      if (!response.ok) {
        throw new Error(`News API error: ${response.status}`);
      }

      const data = await response.json();
      const articles: NewsArticle[] = (data.articles || []).map((article: any) => ({
        title: article.title,
        description: article.description,
        url: article.url,
        publishedAt: article.publishedAt,
        source: article.source?.name || 'Unknown',
        sentiment: this._analyzeSentiment(article.title + ' ' + article.description)
      }));

      const score = this._calculateOverallSentiment(articles);
      
      const result: NewsSentiment = {
        articles,
        overallSentiment: score > 0.2 ? 'bullish' : score < -0.2 ? 'bearish' : 'neutral',
        score
      };

      // Cache the result (10 minutes)
      cache.set(cacheKey, result, 600);
      
      return result;
    } catch (error) {
      console.error('News API error:', error);
      return this._getFallbackNews();
    }
  },

  _analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const lowerText = text.toLowerCase();
    const positiveWords = ['surge', 'rally', 'gain', 'bull', 'rise', 'growth', 'profit', 'success'];
    const negativeWords = ['crash', 'fall', 'bear', 'loss', 'decline', 'drop', 'fail', 'risk'];

    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  },

  _calculateOverallSentiment(articles: NewsArticle[]): number {
    if (articles.length === 0) return 0;

    const scores = articles.map(a => {
      if (a.sentiment === 'positive') return 1;
      if (a.sentiment === 'negative') return -1;
      return 0;
    });

    return scores.reduce((sum, score) => sum + score, 0) / articles.length;
  },

  _getFallbackNews(): NewsSentiment {
    return {
      articles: [
        {
          title: 'Crypto Market Shows Resilience',
          description: 'Major cryptocurrencies maintain stability despite market volatility.',
          url: '#',
          publishedAt: new Date().toISOString(),
          source: 'Simulated',
          sentiment: 'positive'
        }
      ],
      overallSentiment: 'neutral',
      score: 0
    };
  }
};

// ===========================
// HEDERA MIRROR NODE SERVICE
// ===========================

export interface HederaAccount {
  account: string;
  balance: number;
  transactions: number;
}

export interface HederaTransaction {
  transaction_id: string;
  consensus_timestamp: string;
  type: string;
  result: string;
  transfers: any[];
}

export const hederaService = {
  async getAccountInfo(accountId: string): Promise<HederaAccount | null> {
    try {
      const response = await fetch(
        `${HEDERA_MIRROR_NODE_URL}/accounts/${accountId}`
      );

      if (!response.ok) {
        throw new Error(`Hedera API error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        account: data.account,
        balance: parseInt(data.balance?.balance || '0') / 100000000, // Convert tinybars to HBAR
        transactions: data.transactions || 0
      };
    } catch (error) {
      console.error('Hedera account info error:', error);
      return null;
    }
  },

  async getRecentTransactions(accountId?: string, limit: number = 10): Promise<HederaTransaction[]> {
    try {
      const url = accountId 
        ? `${HEDERA_MIRROR_NODE_URL}/transactions?account.id=${accountId}&limit=${limit}&order=desc`
        : `${HEDERA_MIRROR_NODE_URL}/transactions?limit=${limit}&order=desc`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Hedera API error: ${response.status}`);
      }

      const data = await response.json();
      return data.transactions || [];
    } catch (error) {
      console.error('Hedera transactions error:', error);
      return [];
    }
  },

  async getNetworkStats(): Promise<any> {
    try {
      const response = await fetch(`${HEDERA_MIRROR_NODE_URL}/network/supply`);
      
      if (!response.ok) {
        throw new Error(`Hedera API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Hedera network stats error:', error);
      return { error: error instanceof Error ? error.message : 'UNKNOWN_ERROR' };
    }
  },

  async getTokenInfo(tokenId: string): Promise<any> {
    try {
      const response = await fetch(`${HEDERA_MIRROR_NODE_URL}/tokens/${tokenId}`);
      
      if (!response.ok) {
        throw new Error(`Hedera API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Hedera token info error:', error);
      return { error: error instanceof Error ? error.message : 'UNKNOWN_ERROR' };
    }
  }
};

// ===========================
// UNIFIED API ORCHESTRATOR
// ===========================

export interface AgentIntelligence {
  marketData?: CryptoPriceData;
  sentiment?: NewsSentiment;
  onchainData?: any;
  aiInsight?: string;
  timestamp: number;
}

export const orchestrator = {
  async getMarketResearch(coinId: string = 'ethereum'): Promise<AgentIntelligence> {
    const results: AgentIntelligence = {
      timestamp: Date.now()
    };

    try {
      // Get comprehensive market data from CoinGecko
      const marketData = await coingeckoService.getMarketData(coinId);
      results.marketData = marketData;

      // Generate AI analysis based on real data
      try {
        const context = `${marketData.symbol} is trading at $${marketData.price.toLocaleString()} with a 24h change of ${marketData.changePercent >= 0 ? '+' : ''}${marketData.changePercent.toFixed(2)}%. Market cap: $${(marketData.marketCap / 1e9).toFixed(2)}B. Volume: $${(marketData.volume / 1e9).toFixed(2)}B.`;
        const aiResponse = await geminiService.analyzeMarket(marketData.symbol, marketData);
        
        if (aiResponse && !aiResponse.includes('unavailable') && !aiResponse.includes('busy')) {
          results.aiInsight = aiResponse;
        } else {
          results.aiInsight = `Market analysis: ${context}`;
        }
      } catch (error) {
        results.aiInsight = `${marketData.symbol} at $${marketData.price.toLocaleString()}. 24h: ${marketData.changePercent >= 0 ? '+' : ''}${marketData.changePercent.toFixed(2)}%`;
      }

      return results;
    } catch (error) {
      console.error('Market research error:', error);
      return results;
    }
  },

  async getAgentIntelligence(agentRole: string, symbol: string = 'ETH/USD'): Promise<AgentIntelligence> {
    const results: AgentIntelligence = {
      timestamp: Date.now()
    };

    try {
      // Parallel API calls for efficiency
      const [marketData, sentiment, transactions] = await Promise.all([
        coingeckoService.getMarketData('ethereum').catch(() => undefined),
        newsService.getCryptoNews(symbol.split('/')[0]).catch(() => undefined),
        hederaService.getRecentTransactions(undefined, 5).catch(() => [])
      ]);

      results.marketData = marketData;
      results.sentiment = sentiment;
      results.onchainData = { recentTransactions: transactions };

      // Generate AI insight based on collected data (non-blocking)
      try {
        if (marketData && marketData.price && sentiment) {
          const context = `${symbol} is at $${marketData.price.toFixed(2)} with ${sentiment.overallSentiment} sentiment`;
          const aiResponse = await geminiService.generateStrategy(agentRole, context);
          // Only use AI response if it's not an error message
          if (aiResponse && !aiResponse.includes('unavailable') && !aiResponse.includes('busy')) {
            results.aiInsight = aiResponse;
          } else {
            results.aiInsight = `Monitoring ${symbol}. Current price: $${marketData.price.toFixed(2)}`;
          }
        } else if (marketData && marketData.price) {
          const context = `${symbol} is currently at $${marketData.price.toFixed(2)}`;
          const aiResponse = await geminiService.generateStrategy(agentRole, context);
          if (aiResponse && !aiResponse.includes('unavailable') && !aiResponse.includes('busy')) {
            results.aiInsight = aiResponse;
          } else {
            results.aiInsight = `${symbol} at $${marketData.price.toFixed(2)}. Standing by for market signals.`;
          }
        } else {
          results.aiInsight = 'Awaiting market data feed. Systems operational.';
        }
      } catch (error) {
        // Fallback insight when AI is completely unavailable
        if (marketData && marketData.price) {
          results.aiInsight = `Agent ready. Tracking ${symbol} at $${marketData.price.toFixed(2)}.`;
        } else {
          results.aiInsight = 'Systems operational. Awaiting data feed.';
        }
      }

      return results;
    } catch (error) {
      console.error('Orchestrator error:', error);
      return results;
    }
  },

  async analyzeMultiChainActivity(): Promise<any> {
    const [hederaStats, ethPrice, btcPrice] = await Promise.all([
      hederaService.getNetworkStats(),
      cryptoService.getPrice('ETH/USD'),
      cryptoService.getPrice('BTC/USD')
    ]);

    return {
      hedera: hederaStats,
      prices: { eth: ethPrice, btc: btcPrice },
      timestamp: Date.now()
    };
  }
};

// ===========================
// UTILITY FUNCTIONS
// ===========================

export const apiUtils = {
  // Get rate limiter status for all services
  getRateLimitStatus() {
    return {
      gemini: {
        remaining: rateLimiter.getRemainingCalls('gemini'),
        limit: 10,
        resetIn: rateLimiter.getTimeUntilReset('gemini')
      },
      coingecko: {
        remaining: rateLimiter.getRemainingCalls('coingecko'),
        limit: 30,
        resetIn: rateLimiter.getTimeUntilReset('coingecko')
      },
      news: {
        remaining: rateLimiter.getRemainingCalls('news'),
        limit: 20,
        resetIn: rateLimiter.getTimeUntilReset('news')
      }
    };
  },

  // Clear all caches
  clearCache() {
    cache.clear();
    console.log('🧹 All API caches cleared');
  },

  // Get cache stats
  getCacheStats() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('spriteops_cache_'));
    return {
      totalEntries: keys.length,
      keys: keys.map(k => k.replace('spriteops_cache_', ''))
    };
  },

  // Check if we should make an API call (smart throttling)
  shouldMakeApiCall(service: 'gemini' | 'coingecko' | 'news'): boolean {
    const remaining = rateLimiter.getRemainingCalls(service);
    
    // Reserve some calls for critical operations
    if (service === 'gemini') {
      return remaining > 2; // Keep 2 calls in reserve
    }
    
    return remaining > 0;
  }
};

// --- Agent Status Cache for FlowCanvas ---
// Tracks recent agent activities for fast FlowCanvas status updates
interface AgentActivityCache {
  [agentId: string]: {
    status: string;
    timestamp: number;
  };
}

const agentStatusCache: AgentActivityCache = {};
const STATUS_CACHE_TTL = 30000; // 30 seconds

export const agentStatusManager = {
  // Update agent status
  setStatus(agentId: string, status: string) {
    agentStatusCache[agentId] = {
      status,
      timestamp: Date.now()
    };
  },

  // Get current status (returns 'Idling...' if expired)
  getStatus(agentId: string): string {
    const cached = agentStatusCache[agentId];
    if (!cached) return 'Idling...';
    
    const age = Date.now() - cached.timestamp;
    if (age > STATUS_CACHE_TTL) {
      return 'Idling...';
    }
    
    return cached.status;
  },

  // Clear status for specific agent
  clearStatus(agentId: string) {
    delete agentStatusCache[agentId];
  },

  // Get all current statuses
  getAllStatuses(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const agentId in agentStatusCache) {
      result[agentId] = this.getStatus(agentId);
    }
    return result;
  }
};

// --- SauceSwap DEX Service for HBAR/SAUCE Swaps ---
export const sauceSwapService = {
  baseURL: 'https://api.sauceswap.finance',
  testnetURL: 'https://testnet.sauceswap.finance',

  // Get HBAR/SAUCE pair info
  async getPairInfo(): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}/pairs/hbar-sauce`);
      if (!response.ok) throw new Error('Failed to fetch pair info');
      return await response.json();
    } catch (error) {
      console.error('SauceSwap pair info error:', error);
      throw error;
    }
  },

  // Get swap quote
  async getSwapQuote(amountHBAR: number): Promise<{
    amountIn: number;
    amountOut: number;
    priceImpact: number;
    route: string[];
  }> {
    try {
      // Simulated quote for testnet
      const mockRate = 2134.5; // 1 HBAR = ~2134 SAUCE (example rate)
      const priceImpact = amountHBAR > 0.1 ? 0.8 : 0.3; // Higher impact for larger trades
      
      return {
        amountIn: amountHBAR,
        amountOut: amountHBAR * mockRate * (1 - priceImpact / 100),
        priceImpact,
        route: ['HBAR', 'SAUCE']
      };
    } catch (error) {
      console.error('SauceSwap quote error:', error);
      throw error;
    }
  },

  // Execute swap (simulation for now - would need real wallet integration)
  async executeSwap(amountHBAR: number, minAmountOut: number): Promise<{
    success: boolean;
    txHash?: string;
    amountOut?: number;
    error?: string;
  }> {
    try {
      // Safety check: max 0.05 HBAR
      if (amountHBAR > 0.05) {
        throw new Error('Swap amount exceeds safety limit of 0.05 HBAR');
      }

      // Simulated swap execution
      const quote = await this.getSwapQuote(amountHBAR);
      
      if (quote.amountOut < minAmountOut) {
        throw new Error('Slippage tolerance exceeded');
      }

      // Simulate transaction hash
      const mockTxHash = `0x${Math.random().toString(16).substr(2, 64)}`;
      
      console.log(`✅ SWAP EXECUTED: ${amountHBAR} HBAR → ${quote.amountOut.toFixed(2)} SAUCE`);
      console.log(`📝 Tx Hash: ${mockTxHash}`);
      
      return {
        success: true,
        txHash: mockTxHash,
        amountOut: quote.amountOut
      };
    } catch (error: any) {
      console.error('SauceSwap execution error:', error);
      return {
        success: false,
        error: error.message || 'Swap execution failed'
      };
    }
  },

  // Check if swap conditions are met (signal-based)
  shouldExecuteSwap(marketData: any, sentimentScore: number): {
    shouldSwap: boolean;
    reason: string;
    recommendedAmount: number;
  } {
    // Example logic: Buy SAUCE when sentiment is bullish and price is rising
    const priceChange = marketData?.changePercent || 0;
    const isBullish = sentimentScore > 60 && priceChange > 2;
    
    if (isBullish) {
      // Scale swap amount based on signal strength (0.01 to 0.05 HBAR)
      const signalStrength = Math.min((sentimentScore / 100) * (priceChange / 10), 1);
      const recommendedAmount = 0.01 + (signalStrength * 0.04); // 0.01 to 0.05
      
      return {
        shouldSwap: true,
        reason: `Bullish signal: ${sentimentScore}% sentiment, ${priceChange.toFixed(2)}% price change`,
        recommendedAmount: Number(recommendedAmount.toFixed(4))
      };
    }
    
    return {
      shouldSwap: false,
      reason: 'No strong bullish signals detected',
      recommendedAmount: 0
    };
  }
};

// Make utilities available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).apiUtils = apiUtils;
  (window as any).agentStatusManager = agentStatusManager;
  (window as any).sauceSwapService = sauceSwapService;
  
  // Helpful console commands
  console.log('%c🤖 SPRITEOPS API UTILITIES', 'color: #39ff14; font-weight: bold; font-size: 14px;');
  console.log('%cUse these commands in console:', 'color: #39ff14;');
  console.log('  apiUtils.getRateLimitStatus() - Check API rate limits');
  console.log('  apiUtils.getCacheStats() - View cache statistics');
  console.log('  apiUtils.clearCache() - Clear all cached data');
  console.log('  apiUtils.shouldMakeApiCall("gemini") - Check if safe to call API');
  console.log('  agentStatusManager.getAllStatuses() - View agent activity cache');
  console.log('  sauceSwapService.getSwapQuote(0.02) - Get HBAR→SAUCE swap quote');
}
