import React, { useState } from 'react';
import { AgentTaskResult, AgentMetadata } from '../types';
import { TrendingUp, TrendingDown, Shield, Search, Target, Zap, Clock, CheckCircle, XCircle, AlertCircle, DollarSign, Activity, Server, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

interface AgentResultsPageProps {
  agents: AgentMetadata[];
  results: AgentTaskResult[];
  onBack: () => void;
  onClearResults?: () => void;
}

export const AgentResultsPage: React.FC<AgentResultsPageProps> = ({ agents, results, onBack, onClearResults }) => {
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());

  const toggleResult = (index: number) => {
    setExpandedResults(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const getTaskIcon = (taskType: AgentTaskResult['taskType']) => {
    switch (taskType) {
      case 'market_research': return <Search className="w-5 h-5" />;
      case 'sentiment_analysis': return <TrendingUp className="w-5 h-5" />;
      case 'security_audit': return <Shield className="w-5 h-5" />;
      case 'price_prediction': return <Target className="w-5 h-5" />;
      case 'arbitrage_scan': return <Zap className="w-5 h-5" />;
      case 'route_optimization': return <TrendingDown className="w-5 h-5" />;
    }
  };

  const getTaskName = (taskType: AgentTaskResult['taskType']) => {
    switch (taskType) {
      case 'market_research': return 'Market Research';
      case 'sentiment_analysis': return 'Sentiment Analysis';
      case 'security_audit': return 'Security Audit';
      case 'price_prediction': return 'Price Prediction';
      case 'arbitrage_scan': return 'Arbitrage Scanner';
      case 'route_optimization': return 'Route Optimization';
    }
  };

  const getStatusBadge = (status: AgentTaskResult['status']) => {
    switch (status) {
      case 'success': 
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-green-500/20 border border-green-500/50 rounded text-green-400 text-xs font-mono">
            <CheckCircle className="w-3 h-3" />
            <span>SUCCESS</span>
          </div>
        );
      case 'failed': 
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-xs font-mono">
            <XCircle className="w-3 h-3" />
            <span>FAILED</span>
          </div>
        );
      case 'pending': 
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-yellow-500/20 border border-yellow-500/50 rounded text-yellow-400 text-xs font-mono">
            <AlertCircle className="w-3 h-3" />
            <span>PENDING</span>
          </div>
        );
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getAgentById = (agentId: string) => {
    return agents.find(a => a.id === agentId);
  };

  const calculateMetrics = (agentResults: AgentTaskResult[]) => {
    const successCount = agentResults.filter(r => r.status === 'success').length;
    const estimatedCost = agentResults.length * 0.001; // Estimate $0.001 per task
    const avgResponseTime = Math.floor(Math.random() * 2000) + 500; // Mock response time
    
    return {
      successRate: agentResults.length > 0 ? (successCount / agentResults.length * 100).toFixed(1) : '0',
      totalCost: estimatedCost.toFixed(4),
      avgResponseTime: avgResponseTime.toFixed(0),
      totalTasks: agentResults.length
    };
  };

  // Group results by agent
  const resultsByAgent = results.reduce((acc, result) => {
    if (!acc[result.agentId]) {
      acc[result.agentId] = [];
    }
    acc[result.agentId].push(result);
    return acc;
  }, {} as Record<string, AgentTaskResult[]>);

  // Parse and format data based on task type
  const renderTaskData = (result: AgentTaskResult, isExpanded: boolean) => {
    if (!result.data) return null;

    try {
      const data = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;

      // Sentiment Analysis
      if (result.taskType === 'sentiment_analysis' && data.articles) {
        const articles = data.articles.slice(0, isExpanded ? undefined : 3);
        return (
          <div className="space-y-3">
            {articles.map((article: any, idx: number) => (
              <div key={idx} className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h4 className="text-white font-medium text-sm flex-1">{article.title}</h4>
                  <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${
                    article.sentiment === 'bullish' ? 'bg-green-500/20 text-green-400' :
                    article.sentiment === 'bearish' ? 'bg-red-500/20 text-red-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {article.sentiment}
                  </span>
                </div>
                <p className="text-gray-400 text-xs mb-2">{article.description}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="font-mono">{article.source}</span>
                  <span>•</span>
                  <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                  {article.url && (
                    <>
                      <span>•</span>
                      <a href={article.url} target="_blank" rel="noopener noreferrer" 
                         className="text-neon-green hover:underline flex items-center gap-1">
                        Read <ExternalLink className="w-3 h-3" />
                      </a>
                    </>
                  )}
                </div>
              </div>
            ))}
            {!isExpanded && data.articles.length > 3 && (
              <div className="text-center text-xs text-gray-500">
                +{data.articles.length - 3} more articles
              </div>
            )}
          </div>
        );
      }

      // Market Research - CoinGecko comprehensive data
      if (result.taskType === 'market_research' && data.price) {
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-900/50 border border-neon-green/30 rounded-lg p-4">
                <div className="text-xs text-gray-400 mb-1 font-mono">CURRENT PRICE</div>
                <div className="text-2xl font-bold text-neon-green font-mono">${data.price.toLocaleString()}</div>
                {data.symbol && (
                  <div className="text-xs text-gray-500 mt-1 font-mono">{data.symbol}/USD</div>
                )}
              </div>
              <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                <div className="text-xs text-gray-400 mb-1 font-mono">24H CHANGE</div>
                <div className={`text-2xl font-bold font-mono ${data.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {data.changePercent >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
                </div>
                <div className={`text-xs mt-1 font-mono ${data.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {data.change >= 0 ? '+' : ''}${data.change.toFixed(2)}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1 font-mono">24H VOLUME</div>
                <div className="text-lg font-mono text-white">${(data.volume / 1e9).toFixed(2)}B</div>
              </div>
              <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1 font-mono">MARKET CAP</div>
                <div className="text-lg font-mono text-white">${(data.marketCap / 1e9).toFixed(2)}B</div>
              </div>
            </div>

            {(data.high24h || data.low24h) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1 font-mono">24H HIGH</div>
                  <div className="text-sm font-mono text-green-400">${data.high24h?.toLocaleString()}</div>
                </div>
                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1 font-mono">24H LOW</div>
                  <div className="text-sm font-mono text-red-400">${data.low24h?.toLocaleString()}</div>
                </div>
              </div>
            )}

            <div className="bg-neon-green/10 border border-neon-green/30 rounded-lg p-3">
              <div className="flex items-center gap-2 text-xs text-neon-green font-mono mb-1">
                <Activity className="w-3 h-3" />
                <span>DATA SOURCE</span>
              </div>
              <div className="text-xs text-gray-400">Real-time market data from CoinGecko API</div>
            </div>
          </div>
        );
      }

      // Default: show formatted JSON for other types
      return (
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
          <pre className="text-xs text-gray-300 overflow-x-auto font-mono whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      );
    } catch (e) {
      return (
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
          <pre className="text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap">
            {String(result.data)}
          </pre>
        </div>
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-[#050505] text-white overflow-y-auto">
      <div className="min-h-screen p-6">
        {/* Header */}
        <div className="max-w-7xl mx-auto mb-8">
          <button
            onClick={onBack}
            className="mb-6 px-4 py-2 bg-black hover:bg-gray-900 border border-neon-green text-neon-green rounded font-mono text-sm transition-all hover:shadow-[0_0_15px_rgba(67,255,77,0.3)] flex items-center gap-2"
          >
            ← BACK TO GRID
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-neon-green mb-2 font-mono">AGENT OPERATIONS REPORT</h1>
              <p className="text-gray-400 font-mono text-sm">Real-time intelligence from autonomous agents</p>
            </div>
            <div className="text-right flex flex-col gap-3">
              <div>
                <div className="text-xs text-gray-500 font-mono">TOTAL OPERATIONS</div>
                <div className="text-3xl font-bold text-white font-mono">{results.length}</div>
              </div>
              {onClearResults && results.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm('Clear all task results? This cannot be undone.')) {
                      onClearResults();
                    }
                  }}
                  className="px-3 py-1.5 bg-red-900/20 hover:bg-red-900/40 border border-red-500/50 text-red-400 rounded font-mono text-xs transition-all hover:shadow-[0_0_10px_rgba(239,68,68,0.3)]"
                >
                  🗑️ CLEAR ALL
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Results Grid */}
        <div className="max-w-7xl mx-auto space-y-6 pb-8">
        {Object.entries(resultsByAgent).map(([agentId, agentResults]: [string, AgentTaskResult[]]) => {
          const agent = getAgentById(agentId);
          if (!agent) return null;
          
          const metrics = calculateMetrics(agentResults);
          const spriteUrl = `https://api.dicebear.com/9.x/pixel-art/svg?seed=${agent.spriteSeed}&backgroundColor=transparent`;

          return (
            <div key={agentId} className="bg-black/60 backdrop-blur-sm border border-neon-green/30 rounded-xl overflow-hidden shadow-[0_0_20px_rgba(67,255,77,0.1)]">
              {/* Agent Header */}
              <div className="bg-gradient-to-r from-neon-green/10 to-transparent border-b border-neon-green/20 p-6">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-start gap-4 flex-1">
                    <img 
                      src={spriteUrl} 
                      alt={agent.name} 
                      className="w-16 h-16 rounded-lg border-2 border-neon-green/50"
                      style={{ imageRendering: 'pixelated' }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-2xl font-bold text-neon-green font-mono">{agent.name}</h2>
                        <span className="px-2 py-1 bg-neon-green/20 border border-neon-green/50 rounded text-neon-green text-xs font-mono">
                          ⛓️ ON-CHAIN
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm mb-3">{agent.role}</p>
                      <div className="flex items-center gap-4 text-xs font-mono">
                        <div className="flex items-center gap-1">
                          <Shield className="w-3 h-3 text-neon-green" />
                          <span className="text-gray-500">TS:</span>
                          <span className="text-white">{agent.trustScore}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">TOKEN:</span>
                          <span className="text-white">#{agent.tokenId}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Metrics Panel */}
                  <div className="grid grid-cols-4 gap-3 min-w-[400px]">
                    <div className="bg-black/50 border border-gray-700 rounded p-2">
                      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                        <Activity className="w-3 h-3" />
                        <span>TASKS</span>
                      </div>
                      <div className="text-lg font-bold text-white font-mono">{metrics.totalTasks}</div>
                    </div>
                    <div className="bg-black/50 border border-gray-700 rounded p-2">
                      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                        <CheckCircle className="w-3 h-3" />
                        <span>SUCCESS</span>
                      </div>
                      <div className="text-lg font-bold text-green-400 font-mono">{metrics.successRate}%</div>
                    </div>
                    <div className="bg-black/50 border border-gray-700 rounded p-2">
                      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                        <Clock className="w-3 h-3" />
                        <span>AVG TIME</span>
                      </div>
                      <div className="text-lg font-bold text-blue-400 font-mono">{metrics.avgResponseTime}ms</div>
                    </div>
                    <div className="bg-black/50 border border-gray-700 rounded p-2">
                      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                        <DollarSign className="w-3 h-3" />
                        <span>COST</span>
                      </div>
                      <div className="text-lg font-bold text-yellow-400 font-mono">${metrics.totalCost}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Task Results */}
              <div className="p-6 space-y-4">
                {agentResults.map((result, idx) => {
                  const isExpanded = expandedResults.has(idx);
                  const globalIdx = results.indexOf(result);
                  
                  return (
                    <div 
                      key={idx}
                      className="bg-gray-900/50 border border-gray-700 rounded-lg overflow-hidden hover:border-neon-green/30 transition-all"
                    >
                      {/* Task Header */}
                      <div 
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800/50"
                        onClick={() => toggleResult(globalIdx)}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="p-2 bg-gray-800 rounded text-neon-green">
                            {getTaskIcon(result.taskType)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-white font-mono text-sm">
                                {getTaskName(result.taskType)}
                              </h3>
                              {getStatusBadge(result.status)}
                            </div>
                            <p className="text-gray-400 text-xs">{result.summary}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
                            <Clock className="w-3 h-3" />
                            {formatTimestamp(result.timestamp)}
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </div>

                      {/* Task Data (Expandable) */}
                      {isExpanded && result.data && (
                        <div className="border-t border-gray-700 p-4">
                          {renderTaskData(result, isExpanded)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {Object.keys(resultsByAgent).length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-2xl font-bold text-gray-400 mb-2 font-mono">NO OPERATIONS YET</h2>
            <p className="text-gray-500 font-mono text-sm">Agents will report their findings here...</p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
