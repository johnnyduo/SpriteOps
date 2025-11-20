import React from 'react';
import { AgentMetadata } from '../types';
import { X, Copy, Terminal, Zap } from 'lucide-react';
import { AGENT_ABILITIES } from '../constants';
import { useAccount } from 'wagmi';

interface AgentDetailPanelProps {
  agent: AgentMetadata | null;
  onClose: () => void;
}

const AgentDetailPanel: React.FC<AgentDetailPanelProps> = ({ agent, onClose }) => {
  const { address } = useAccount();
  
  if (!agent) return null;

  return (
    <div className="absolute right-0 top-10 bottom-0 w-96 bg-black/95 border-l border-neon-green/30 backdrop-blur-xl shadow-2xl z-[60] transform transition-transform duration-300 flex flex-col">
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-neon-green/5">
        <h2 className="text-neon-green font-bold font-mono flex items-center gap-2">
          <span className="text-xs bg-neon-green text-black px-1 rounded">EIP-8004</span>
          AGENT DETAILS
        </h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Avatar Header */}
        <div className="flex flex-col items-center mb-6">
           <div className="w-32 h-32 border border-white/20 rounded-lg p-2 bg-black relative overflow-hidden group">
             <div className="absolute inset-0 bg-neon-green/20 blur-xl opacity-50"></div>
             <img 
                src={agent.avatar} 
                className="w-full h-full object-contain relative z-10 drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)]"
                style={{ imageRendering: 'pixelated' }}
                alt={agent.name}
             />
             <div className="absolute bottom-0 left-0 right-0 bg-neon-green/20 h-1/3 blur-xl"></div>
           </div>
           <h1 className="text-2xl font-bold text-white mt-4 font-mono">{agent.name}</h1>
           <span className="text-neon-green text-sm font-mono tracking-wider">{agent.role}</span>
        </div>

        {/* Identity Data */}
        <div className="space-y-6">
            <div className="space-y-2">
                <label className="text-xs text-gray-500 font-mono uppercase">Description</label>
                <p className="text-sm text-gray-300 leading-relaxed">{agent.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 p-3 rounded border border-white/10">
                    <label className="text-[10px] text-gray-500 font-mono uppercase block mb-1">Token ID</label>
                    <span className="text-lg font-mono text-white">#{agent.tokenId}</span>
                </div>
                <div className="bg-white/5 p-3 rounded border border-white/10">
                    <label className="text-[10px] text-gray-500 font-mono uppercase block mb-1">Trust Score</label>
                    <span className="text-lg font-mono text-neon-green">{agent.trustScore}/100</span>
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-xs text-gray-500 font-mono uppercase">Capabilities</label>
                <div className="flex flex-wrap gap-2">
                    {agent.capabilities.map(cap => (
                        <span key={cap} className="px-2 py-1 bg-white/5 border border-white/20 rounded text-xs text-gray-300 hover:border-neon-green/50 transition-colors cursor-help">
                            {cap}
                        </span>
                    ))}
                </div>
            </div>

            {/* API Integrations */}
            {AGENT_ABILITIES[agent.id as keyof typeof AGENT_ABILITIES]?.apis && AGENT_ABILITIES[agent.id as keyof typeof AGENT_ABILITIES].apis.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs text-gray-500 font-mono uppercase flex items-center gap-2">
                  <Zap size={12} className="text-neon-green" />
                  API Integrations
                </label>
                <div className="flex flex-wrap gap-2">
                  {AGENT_ABILITIES[agent.id as keyof typeof AGENT_ABILITIES].apis.map((api: string) => (
                    <span 
                      key={api} 
                      className="px-2 py-1 bg-neon-green/10 border border-neon-green/30 rounded text-xs text-neon-green font-mono hover:bg-neon-green/20 transition-colors cursor-help"
                      title={AGENT_ABILITIES[agent.id as keyof typeof AGENT_ABILITIES].apiEndpoints?.[api] || api}
                    >
                      ⚡ {api}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
                <label className="text-xs text-gray-500 font-mono uppercase">On-Chain Identity</label>
                <div 
                  className="flex items-center gap-2 bg-black p-2 rounded border border-white/10 font-mono text-xs break-all cursor-pointer hover:bg-white/5 transition-colors group"
                  onClick={() => {
                    // Get agent address from localStorage
                    const storedAddresses = localStorage.getItem('agentAddresses');
                    const addresses = storedAddresses ? JSON.parse(storedAddresses) : {};
                    const agentAddress = addresses[agent.id] || `0x650665fdf08EeE72e84953D5a99AbC8196C56E77-${agent.tokenId}`;
                    navigator.clipboard.writeText(agentAddress);
                  }}
                  title="Click to copy agent identity address"
                >
                    <div className="flex-1">
                      <div className="text-gray-500 text-[10px] mb-0.5">Agent Address</div>
                      <div className="text-neon-green">
                        {(() => {
                          const storedAddresses = localStorage.getItem('agentAddresses');
                          const addresses = storedAddresses ? JSON.parse(storedAddresses) : {};
                          const agentAddress = addresses[agent.id] || `0x650665fdf08EeE72e84953D5a99AbC8196C56E77-${agent.tokenId}`;
                          return agentAddress.length > 30 
                            ? `${agentAddress.slice(0, 10)}...${agentAddress.slice(-8)}`
                            : agentAddress;
                        })()}
                      </div>
                      <div className="text-gray-400 mt-0.5 text-[10px]">Token #{agent.tokenId}</div>
                    </div>
                    <Copy size={12} className="ml-auto text-neon-green opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
                {address && (
                  <div className="text-[10px] text-gray-500 font-mono mt-1 px-2">
                    Owner: {address.slice(0, 6)}...{address.slice(-4)}
                  </div>
                )}
            </div>

            <div className="space-y-2 pt-4 border-t border-white/10">
                <label className="text-xs text-gray-500 font-mono uppercase flex items-center gap-2">
                    <Terminal size={12} /> Avatar
                </label>
                <div className="bg-black p-3 rounded border border-white/10 text-center">
                    <img src={agent.avatar} alt={agent.name} className="w-24 h-24 mx-auto object-contain" style={{ imageRendering: 'pixelated' }} />
                    <p className="text-[10px] text-gray-500 font-mono mt-2">{agent.avatar}</p>
                </div>
            </div>
        </div>
      </div>

      <div className="p-4 border-t border-white/10 bg-black/50 backdrop-blur">
          <button className="w-full py-3 bg-neon-green text-black font-bold font-mono rounded hover:bg-white hover:shadow-[0_0_20px_#43FF4D] transition-all">
              INITIATE DIRECT COMM
          </button>
      </div>
    </div>
  );
};

export default AgentDetailPanel;