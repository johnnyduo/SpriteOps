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

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: request.prompt,
      });
      
      const text = response.text || 'No response';
      
      return { text };
    } catch (error) {
      console.error('Gemini API error:', error);
      return { 
        text: 'Failed to connect to Gemini', 
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR' 
      };
    }
  },

  // Agent-specific intelligence queries
  async analyzeMarket(symbol: string, data: any): Promise<string> {
    const prompt = `As a crypto market analyst, analyze ${symbol} with the following data: ${JSON.stringify(data)}. Provide a concise 2-sentence market insight.`;
    const response = await this.chat({ prompt, temperature: 0.5 });
    return response.text;
  },

  async generateStrategy(agentRole: string, context: string): Promise<string> {
    const prompt = `You are a ${agentRole} agent in a decentralized AI network. Given context: ${context}. Suggest the next optimal action in 1 sentence.`;
    const response = await this.chat({ prompt, temperature: 0.8 });
    return response.text;
  }
};

// ===========================
// TWELVEDATA CRYPTO SERVICE
// ===========================

export interface CryptoPriceData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: number;
  error?: string;
}

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
    if (!NEWS_API_KEY) {
      console.warn('News API key not configured');
      return this._getFallbackNews();
    }

    try {
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
      
      return {
        articles,
        overallSentiment: score > 0.2 ? 'bullish' : score < -0.2 ? 'bearish' : 'neutral',
        score
      };
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
  async getAgentIntelligence(agentRole: string, symbol: string = 'ETH/USD'): Promise<AgentIntelligence> {
    const results: AgentIntelligence = {
      timestamp: Date.now()
    };

    try {
      // Parallel API calls for efficiency
      const [marketData, sentiment, transactions] = await Promise.all([
        cryptoService.getPrice(symbol).catch(() => undefined),
        newsService.getCryptoNews(symbol.split('/')[0]).catch(() => undefined),
        hederaService.getRecentTransactions(undefined, 5).catch(() => [])
      ]);

      results.marketData = marketData;
      results.sentiment = sentiment;
      results.onchainData = { recentTransactions: transactions };

      // Generate AI insight based on collected data
      if (marketData && sentiment) {
        const context = `${symbol} is at $${marketData.price.toFixed(2)} with ${sentiment.overallSentiment} sentiment`;
        results.aiInsight = await geminiService.generateStrategy(agentRole, context);
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
