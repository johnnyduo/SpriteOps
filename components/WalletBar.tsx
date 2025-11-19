import React, { useState, useEffect } from 'react';
import { Layers, BarChart3, Zap } from 'lucide-react';
import { WalletConnect } from './WalletConnect';
import { apiUtils } from '../services/api';

interface WalletBarProps {
  onViewResults?: () => void;
}

const WalletBar: React.FC<WalletBarProps> = ({ 
  onViewResults
}) => {
  const [geminiRemaining, setGeminiRemaining] = useState(10);

  // Update rate limit status every 5 seconds
  useEffect(() => {
    const updateStatus = () => {
      const status = apiUtils.getRateLimitStatus();
      setGeminiRemaining(status.gemini.remaining);
    };

    updateStatus();
    const interval = setInterval(updateStatus, 5000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="h-12 bg-black/80 backdrop-blur-md border-b border-white/10 flex items-center px-6 justify-between z-50 sticky top-0">
        <div className="flex items-center gap-4">
            <h1 className="text-neon-green font-bold font-mono tracking-wider flex items-center gap-2">
                <Layers size={18} /> SPRITEOPS <span className="text-white/40 text-xs font-normal">v1.0.4-beta</span>
            </h1>
        </div>

        <div className="flex items-center gap-4 font-mono text-xs">
            <div className="flex items-center gap-2 bg-neon-green/10 px-3 py-1 rounded border border-neon-green/30">
                <span className="text-neon-green/70">x402 STREAM:</span>
                <span className="text-neon-green font-bold animate-pulse">0.00042 ETH/s</span>
            </div>

            {/* AI Quota Status */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded border ${
              geminiRemaining > 5 
                ? 'bg-green-500/10 border-green-500/30' 
                : geminiRemaining > 2 
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : 'bg-red-500/10 border-red-500/30'
            }`}>
                <Zap size={12} className={
                  geminiRemaining > 5 
                    ? 'text-green-500' 
                    : geminiRemaining > 2 
                      ? 'text-yellow-500'
                      : 'text-red-500'
                } />
                <span className={
                  geminiRemaining > 5 
                    ? 'text-green-500/70' 
                    : geminiRemaining > 2 
                      ? 'text-yellow-500/70'
                      : 'text-red-500/70'
                }>AI QUOTA:</span>
                <span className={`font-bold ${
                  geminiRemaining > 5 
                    ? 'text-green-500' 
                    : geminiRemaining > 2 
                      ? 'text-yellow-500'
                      : 'text-red-500'
                }`}>{geminiRemaining}/10</span>
            </div>

            {onViewResults && (
                <button
                    onClick={onViewResults}
                    className="flex items-center gap-2 bg-[#39ff14]/10 hover:bg-[#39ff14]/20 px-3 py-1 rounded border border-[#39ff14]/30 transition-colors"
                >
                    <BarChart3 size={14} className="text-[#39ff14]" />
                    <span className="text-[#39ff14] font-semibold">Results</span>
                </button>
            )}

            <WalletConnect />
        </div>
    </div>
  );
};

export default WalletBar;