import React, { useState, useEffect, useCallback } from 'react';
import { AGENTS, INITIAL_LOGS } from './constants';
import { AgentMetadata, LogMessage, AgentTaskResult } from './types';
import WalletBar from './components/WalletBar';
import FlowCanvas from './components/FlowCanvas';
import AgentCard from './components/AgentCard';
import ConsolePanel from './components/ConsolePanel';
import AgentDetailPanel from './components/AgentDetailPanel';
import { AgentDialogue } from './components/AgentDialogue';
import { AgentResultsPage } from './components/AgentResultsPage';
import { ModeControl } from './components/ModeControl';
import { orchestrator, cryptoService, newsService, hederaService } from './services/api';
import { testAPIs } from './testAPIs';
import { useMintAgent, useDeactivateAgent } from './hooks/useAgentContract';
import { useAccount } from 'wagmi';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './toast-custom.css';

// Make test function available in browser console
if (typeof window !== 'undefined') {
  (window as any).testAPIs = testAPIs;
}

// Helper to get Hedera testnet explorer URL
const getHederaExplorerUrl = (txHash: string) => {
  return `https://hashscan.io/testnet/transaction/${txHash}`;
};

const App: React.FC = () => {
  // --- Wallet & Contract Hooks ---
  const { address, isConnected } = useAccount();
  const { mintAgent, isPending: isMinting, isConfirming, isSuccess: mintSuccess, hash, receipt } = useMintAgent();
  const { deactivateAgent, isPending: isDeactivating, isConfirming: isDeactivateConfirming, isSuccess: deactivateSuccess, hash: deactivateHash } = useDeactivateAgent();
  
  // --- State ---
  const [activeAgents, setActiveAgents] = useState<string[]>(() => {
    const stored = localStorage.getItem('activeAgents');
    return stored ? JSON.parse(stored) : [];
  });
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogMessage[]>(INITIAL_LOGS);
  const [streamingEdges, setStreamingEdges] = useState<string[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, 'idle' | 'negotiating' | 'streaming' | 'offline'>>({});
  const [mintingAgents, setMintingAgents] = useState<Set<string>>(new Set());
  const [deactivatingAgents, setDeactivatingAgents] = useState<Set<string>>(new Set());
  const [onChainAgents, setOnChainAgents] = useState<Record<string, bigint>>(() => {
    const stored = localStorage.getItem('onChainAgents');
    return stored ? JSON.parse(stored, (key, value) => {
      // Convert string back to bigint for values that look like numbers
      if (typeof value === 'string' && /^\d+$/.test(value)) {
        return BigInt(value);
      }
      return value;
    }) : {};
  }); // agentId -> tokenId
  
  // --- New State for Dialogue & Results ---
  const [activeDialogue, setActiveDialogue] = useState<{
    agentId: string;
    dialogue: string;
  } | null>(null);
  const [taskResults, setTaskResults] = useState<AgentTaskResult[]>([]);
  const [showResultsPage, setShowResultsPage] = useState(false);
  const [agentPositions, setAgentPositions] = useState<Record<string, { x: number; y: number }>>({});
  
  // --- Mode Control State ---
  const [operationMode, setOperationMode] = useState<'auto' | 'manual'>('manual');
  const [commanderBudget, setCommanderBudget] = useState<number>(100); // USDC
  const [budgetSpent, setBudgetSpent] = useState<number>(0);

  // --- Memoized callback for closing dialogue ---
  const handleCloseDialogue = useCallback(() => {
    setActiveDialogue(null);
  }, []);

  // --- Initialization: Check API Status ---
  useEffect(() => {
    const checkAPIs = async () => {
      addLog('SYSTEM', '🚀 SPRITEOPS Grid Initializing...');
      addLog('SYSTEM', '💡 TIP: Run testAPIs() in browser console to verify all API connections');
      
      // Quick API availability check
      setTimeout(() => {
        addLog('SYSTEM', '✅ Gemini AI: Ready for agent intelligence');
        addLog('SYSTEM', '✅ TwelveData: Ready for crypto market data');
        addLog('SYSTEM', '✅ News API: Ready for sentiment analysis');
        addLog('SYSTEM', '✅ Hedera Testnet: Connected (Chain ID: 296)');
      }, 1000);
    };
    
    checkAPIs();
  }, []);

  // --- Track mint success and extract tokenId from event ---
  useEffect(() => {
    if (mintSuccess && hash && receipt) {
      const explorerUrl = getHederaExplorerUrl(hash);
      
      // Show toast notification
      toast.success(
        <div>
          <div className="font-bold">✅ Agent Minted Successfully!</div>
          <a 
            href={explorerUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-neon-green hover:underline text-sm"
          >
            View on Hedera Explorer →
          </a>
          <div className="text-xs text-gray-400 mt-1 truncate">Tx: {hash.slice(0, 10)}...{hash.slice(-8)}</div>
        </div>,
        { autoClose: 8000 }
      );
      
      addLog('SYSTEM', `⛓️ Agent minted successfully! Tx: ${hash.slice(0, 10)}...`);
      
      // Extract tokenId from AgentCreated event in transaction logs
      try {
        // Find the AgentCreated event in the logs
        const agentCreatedLog = receipt.logs.find((log: any) => {
          // AgentCreated event signature: keccak256("AgentCreated(uint256,address,string,string,uint256)")
          return log.topics && log.topics.length > 0;
        });
        
        if (agentCreatedLog && agentCreatedLog.topics && agentCreatedLog.topics[1]) {
          // First indexed parameter (topics[1]) is the agentId (tokenId)
          const tokenId = BigInt(agentCreatedLog.topics[1]);
          
          // Find which agent was being minted and store its tokenId
          mintingAgents.forEach(agentId => {
            const agent = AGENTS.find(a => a.id === agentId);
            setOnChainAgents(prev => ({
              ...prev,
              [agentId]: tokenId
            }));
            addLog('SYSTEM', `🎫 ${agent?.name} received tokenId: ${tokenId.toString()}`);
          });
        }
      } catch (error) {
        console.error('Error extracting tokenId from receipt:', error);
        // Fallback: use timestamp-based ID
        mintingAgents.forEach(agentId => {
          const tokenId = BigInt(Date.now());
          setOnChainAgents(prev => ({
            ...prev,
            [agentId]: tokenId
          }));
        });
      }
      
      // Clear minting state
      setMintingAgents(new Set());
    }
  }, [mintSuccess, hash, receipt, mintingAgents]);

  // --- Track mint confirmation ---
  useEffect(() => {
    if (isConfirming) {
      addLog('SYSTEM', '⏳ Waiting for blockchain confirmation...');
    }
  }, [isConfirming]);

  // --- Track deactivate confirmation ---
  useEffect(() => {
    if (isDeactivateConfirming) {
      addLog('SYSTEM', '⏳ Waiting for deactivation confirmation...');
    }
  }, [isDeactivateConfirming]);

  // --- Track deactivate success ---
  useEffect(() => {
    if (deactivateSuccess && deactivateHash) {
      const explorerUrl = getHederaExplorerUrl(deactivateHash);
      
      // Show toast notification
      toast.info(
        <div>
          <div className="font-bold">🔻 Agent Deactivated On-Chain</div>
          <a 
            href={explorerUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-neon-green hover:underline text-sm"
          >
            View on Hedera Explorer →
          </a>
          <div className="text-xs text-gray-400 mt-1 truncate">Tx: {deactivateHash.slice(0, 10)}...{deactivateHash.slice(-8)}</div>
        </div>,
        { autoClose: 8000 }
      );
      
      addLog('SYSTEM', `⛓️ Agent deactivated on-chain! Tx: ${deactivateHash.slice(0, 10)}...`);
      // Clear deactivating state
      setDeactivatingAgents(new Set());
    }
  }, [deactivateSuccess, deactivateHash]);

  // --- Persist onChainAgents to localStorage ---
  useEffect(() => {
    localStorage.setItem('onChainAgents', JSON.stringify(onChainAgents, (key, value) => {
      // Convert bigint to string for JSON serialization
      return typeof value === 'bigint' ? value.toString() : value;
    }));
  }, [onChainAgents]);

  // --- Auto Mode: Activate Commander when mode switches ---
  useEffect(() => {
    if (operationMode === 'auto') {
      // Auto-activate Commander if not active
      if (!activeAgents.includes('a0')) {
        addLog('SYSTEM', '⚡ AUTO MODE: Activating Commander Nexus with budget of ' + commanderBudget.toFixed(2) + ' USDC');
        setActiveAgents(prev => ['a0', ...prev]);
        setTimeout(() => showAgentDialogue('a0', 'greeting'), 1000);
      }
      setBudgetSpent(0); // Reset budget spent
    } else {
      // Manual mode: can deactivate all if needed
      addLog('SYSTEM', '✋ MANUAL MODE: Full manual control enabled');
    }
  }, [operationMode, commanderBudget]);

  // --- Handlers ---
  const addLog = (type: 'A2A' | 'x402' | 'SYSTEM', content: string) => {
    const newLog: LogMessage = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      content
    };
    setLogs(prev => [...prev.slice(-99), newLog]); // Keep last 100
  };

  // --- Helper: Show contextual dialogue ---
  const showAgentDialogue = useCallback((agentId: string, context?: 'greeting' | 'analyzing' | 'negotiating' | 'success' | 'idle') => {
    const agent = AGENTS.find(a => a.id === agentId);
    if (!agent || !agent.personality) {
      console.warn(`Agent ${agentId} not found or has no personality`);
      return;
    }

    const dialogues = agent.personality.dialogues;
    let selectedDialogue: string;
    
    // Contextual dialogue selection for more natural conversation
    if (context === 'greeting') {
      // Use first dialogue as greeting
      selectedDialogue = dialogues[0];
    } else if (context === 'analyzing') {
      // Prefer middle dialogues for analytical moments
      const analyticalIndex = Math.floor(dialogues.length / 3) + Math.floor(Math.random() * 2);
      selectedDialogue = dialogues[analyticalIndex] || dialogues[Math.floor(Math.random() * dialogues.length)];
    } else if (context === 'success') {
      // Use later dialogues for success moments
      const successIndex = Math.floor(dialogues.length * 0.6) + Math.floor(Math.random() * 2);
      selectedDialogue = dialogues[successIndex] || dialogues[Math.floor(Math.random() * dialogues.length)];
    } else {
      // Random for idle chatter
      selectedDialogue = dialogues[Math.floor(Math.random() * dialogues.length)];
    }
    
    console.log(`🗨️ ${agent.name}: "${selectedDialogue}"`);
    
    setActiveDialogue({
      agentId: agentId,
      dialogue: selectedDialogue
    });

    // Auto-dismiss after 5-7 seconds (varied for natural feel)
    const dismissTime = 5000 + Math.random() * 2000;
    setTimeout(() => setActiveDialogue(null), dismissTime);
  }, []);

  const toggleAgent = useCallback(async (id: string) => {
    // In auto mode, only Commander can be manually toggled, others are controlled by Commander
    if (operationMode === 'auto' && id !== 'a0') {
      addLog('SYSTEM', '⚠️ Auto mode active: Only Commander can control agent activation');
      return;
    }
    
    const isCurrentlyActive = activeAgents.includes(id);
    const agent = AGENTS.find(a => a.id === id);
    const isActivating = !isCurrentlyActive;
    const agentTokenId = onChainAgents[id];
    
    // If activating and not on-chain yet, require wallet connection
    if (isActivating && !agentTokenId && !isConnected) {
      addLog('SYSTEM', '🔌 Please connect wallet to register agent on-chain');
      return;
    }
    
    // If deactivating an on-chain agent, require wallet connection for deactivation tx
    if (!isActivating && agentTokenId && !isConnected) {
      addLog('SYSTEM', '🔌 Please connect wallet to deactivate agent on-chain');
      return;
    }
    
    // If activating and wallet connected, mint agent on-chain
    if (isActivating && isConnected && agent && !agentTokenId) {
      addLog('SYSTEM', `📝 Registering ${agent.name} on-chain...`);
      setMintingAgents(prev => new Set(prev).add(id));
      
      try {
        await mintAgent({
          name: agent.name,
          role: agent.role,
          description: agent.description || '',
          capabilities: agent.capabilities || []
        });
        
        addLog('SYSTEM', `✅ ${agent.name} registered on-chain! Tx: ${hash?.slice(0, 10)}...`);
      } catch (error: any) {
        const errorMsg = error.message || 'User rejected transaction';
        addLog('SYSTEM', `❌ On-chain registration failed: ${errorMsg}`);
        
        toast.error(
          <div>
            <div className="font-bold">❌ Minting Failed</div>
            <div className="text-sm">{agent.name}: {errorMsg}</div>
          </div>,
          { autoClose: 5000 }
        );
        
        setMintingAgents(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        return; // Don't activate if minting failed
      }
    }
    
    // If deactivating an on-chain agent, call deactivateAgent
    if (!isActivating && isConnected && agent && agentTokenId) {
      addLog('SYSTEM', `🔻 Deactivating ${agent.name} on-chain...`);
      setDeactivatingAgents(prev => new Set(prev).add(id));
      
      try {
        await deactivateAgent(agentTokenId);
        addLog('SYSTEM', `✅ ${agent.name} deactivated on-chain! Tx: ${deactivateHash?.slice(0, 10)}...`);
      } catch (error: any) {
        const errorMsg = error.message || 'User rejected transaction';
        addLog('SYSTEM', `❌ On-chain deactivation failed: ${errorMsg}`);
        
        toast.error(
          <div>
            <div className="font-bold">❌ Deactivation Failed</div>
            <div className="text-sm">{agent.name}: {errorMsg}</div>
          </div>,
          { autoClose: 5000 }
        );
        
        setDeactivatingAgents(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        return; // Don't deactivate if on-chain deactivation failed
      }
    }
    
    // Update active agents state
    setActiveAgents(prev => {
      const updated = prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id];
      // Persist to localStorage
      localStorage.setItem('activeAgents', JSON.stringify(updated));
      return updated;
    });
    
    // Add log
    addLog('SYSTEM', `Agent ${agent?.name} ${isActivating ? 'ACTIVATED' : 'DEACTIVATED'} on grid.`);
    
    // Show greeting dialogue when activating
    if (isActivating && agent?.personality) {
      setTimeout(() => showAgentDialogue(id, 'greeting'), 1000);
    }
  }, [activeAgents, showAgentDialogue, operationMode, isConnected, mintAgent, deactivateAgent, hash, deactivateHash, onChainAgents]);

  // --- Helper: Add task result ---
  const addTaskResult = useCallback((result: Omit<AgentTaskResult, 'timestamp'>) => {
    const newResult: AgentTaskResult = {
      ...result,
      timestamp: Date.now()
    };
    setTaskResults(prev => [...prev, newResult]);
  }, []);

  // --- API Integration: Fetch real-time data for agents ---
  const fetchAgentIntelligence = useCallback(async (agentId: string) => {
    const agent = AGENTS.find(a => a.id === agentId);
    if (!agent) return;

    setAgentStatuses(prev => ({ ...prev, [agentId]: 'negotiating' }));

    try {
      const intelligence = await orchestrator.getAgentIntelligence(agent.role, 'ETH/USD');
      
      // Log market data
      if (intelligence.marketData && intelligence.marketData.price) {
        addLog('SYSTEM', `[${agent.name}] Market Analysis: ETH at $${intelligence.marketData.price.toFixed(2)}`);
        
        // Add market research result
        addTaskResult({
          agentId: agent.id,
          agentName: agent.name,
          taskType: 'market_research',
          status: 'success',
          data: intelligence.marketData,
          summary: `Market analysis completed: ETH at $${intelligence.marketData.price.toFixed(2)}, 24h change: ${(intelligence.marketData.change24h || 0).toFixed(2)}%`
        });
      } else {
        addLog('SYSTEM', `[${agent.name}] Market data temporarily unavailable`);
      }

      // Log AI insight
      if (intelligence.aiInsight) {
        addLog('A2A', `[${agent.name}]: ${intelligence.aiInsight}`);
        
        // Add prediction result
        addTaskResult({
          agentId: agent.id,
          agentName: agent.name,
          taskType: 'price_prediction',
          status: 'success',
          data: { insight: intelligence.aiInsight },
          summary: intelligence.aiInsight
        });
      }

      // Log sentiment
      if (intelligence.sentiment) {
        addLog('SYSTEM', `[${agent.name}] Sentiment: ${intelligence.sentiment.overallSentiment.toUpperCase()} (${intelligence.sentiment.articles.length} sources)`);
        
        // Add sentiment analysis result
        addTaskResult({
          agentId: agent.id,
          agentName: agent.name,
          taskType: 'sentiment_analysis',
          status: 'success',
          data: intelligence.sentiment,
          summary: `Sentiment analysis: ${intelligence.sentiment.overallSentiment.toUpperCase()} based on ${intelligence.sentiment.articles.length} news sources`
        });
      }

      // Show contextual dialogue after completing intelligence fetch
      if (Math.random() < 0.8) { // 80% chance
        showAgentDialogue(agentId, 'success');
      }

      setAgentStatuses(prev => ({ ...prev, [agentId]: 'idle' }));
    } catch (error: any) {
      console.error('Intelligence fetch error:', error);
      const errorMessage = error?.message || 'Service temporarily unavailable';
      addLog('SYSTEM', `⚠️ ${agent.name}: ${errorMessage}`);
      
      // Add error task result
      addTaskResult({
        agentId: agent.id,
        agentName: agent.name,
        taskType: 'market_research',
        status: 'error',
        summary: `Intelligence fetch error: ${errorMessage}`
      });
      
      setAgentStatuses(prev => ({ ...prev, [agentId]: 'idle' }));
    }
  }, [addTaskResult, showAgentDialogue]);

  // --- Simulation Loop (The "Life" of the app) ---
  useEffect(() => {
    if (activeAgents.length < 1) {
      setStreamingEdges([]);
      return;
    }

    const interval = setInterval(async () => {
      const rand = Math.random();

      // 1. Fetch real intelligence for random agent (25% chance)
      if (rand < 0.25 && activeAgents.length > 0) {
        const randomAgent = activeAgents[Math.floor(Math.random() * activeAgents.length)];
        fetchAgentIntelligence(randomAgent);
      }

      // 2. A2A Negotiation Event (30% chance)
      else if (rand >= 0.25 && rand < 0.55 && activeAgents.length >= 2) {
        const senderId = activeAgents[Math.floor(Math.random() * activeAgents.length)];
        const receiverId = activeAgents.find(id => id !== senderId) || activeAgents[0];
        const sender = AGENTS.find(a => a.id === senderId)!;
        const receiver = AGENTS.find(a => a.id === receiverId)!;

        setAgentStatuses(prev => ({ 
          ...prev, 
          [senderId]: 'negotiating',
          [receiverId]: 'negotiating'
        }));

        const messages = [
          `Requesting dataset access for block range #1820000...`,
          `Offer: 0.005 ETH for optimal routing path.`,
          `Verifying SLA contract signature...`,
          `Handshaking with protocol v2.1...`,
          `Querying price oracle for asset pair...`,
          `Analyzing Hedera network throughput...`,
          `Proposing liquidity pool strategy...`
        ];
        const msg = messages[Math.floor(Math.random() * messages.length)];
        
        addLog('A2A', `[${sender.name} -> ${receiver.name}]: ${msg}`);
        
        // Show dialogue from sender (70% chance)
        if (Math.random() < 0.7) {
          showAgentDialogue(senderId, 'negotiating');
        }

        setTimeout(() => {
          setAgentStatuses(prev => ({ 
            ...prev, 
            [senderId]: 'idle',
            [receiverId]: 'idle'
          }));
        }, 2000);
      }
      
      // 3. x402 Streaming Event (20% chance to start a stream)
      else if (rand >= 0.55 && rand < 0.75 && activeAgents.length >= 2) {
        // In auto mode, check budget before starting stream
        if (operationMode === 'auto') {
          const streamCost = 0.5 + Math.random() * 2; // 0.5-2.5 USDC per stream
          if (budgetSpent + streamCost > commanderBudget) {
            addLog('SYSTEM', '⚠️ Insufficient budget for x402 stream. Commander pausing operations.');
            return;
          }
          setBudgetSpent(prev => prev + streamCost);
          addLog('x402', `💰 Budget: ${streamCost.toFixed(2)} USDC spent on stream. Remaining: ${(commanderBudget - budgetSpent - streamCost).toFixed(2)} USDC`);
        }
        
        const id1 = activeAgents[Math.floor(Math.random() * activeAgents.length)];
        const id2 = activeAgents.find(id => id !== id1);
        
        if (id1 && id2) {
           const sender = AGENTS.find(a => a.id === id1)!;
           const receiver = AGENTS.find(a => a.id === id2)!;
           
           // Create edge ID format that ReactFlow uses
           const edgeId = `reactflow__edge-${id1}-${id2}`;
           
           setAgentStatuses(prev => ({ 
             ...prev, 
             [id1]: 'streaming',
             [id2]: 'streaming'
           }));

           setStreamingEdges(prev => [...prev, edgeId]);
           
           const rate = Math.floor(Math.random() * 500 + 100);
           addLog('x402', `Stream OPENED: ${sender.name} → ${receiver.name} @ ${rate} wei/sec`);
           
           // Auto-close stream after random duration
           setTimeout(() => {
             setStreamingEdges(prev => prev.filter(e => e !== edgeId));
             setAgentStatuses(prev => ({ 
               ...prev, 
               [id1]: 'idle',
               [id2]: 'idle'
             }));
             addLog('x402', `Stream CLOSED: ${sender.name} → ${receiver.name}`);
           }, 4000 + Math.random() * 4000);
        }
      }

      // 4. Hedera on-chain activity check (15% chance)
      else if (rand >= 0.75 && rand < 0.9) {
        const transactions = await hederaService.getRecentTransactions(undefined, 3);
        if (transactions.length > 0) {
          addLog('SYSTEM', `Hedera Network: ${transactions.length} recent transactions detected`);
        }
      }

    }, 3000);

    return () => clearInterval(interval);
  }, [activeAgents, fetchAgentIntelligence]);

  // --- Commander: Orchestrate team operations ---
  useEffect(() => {
    const commanderAgent = AGENTS.find(a => a.id === 'a0'); // Commander Nexus
    const isCommanderActive = activeAgents.includes('a0');
    
    if (!isCommanderActive || activeAgents.length < 3) return;

    // Commander issues periodic status checks
    const commanderInterval = setInterval(() => {
      const otherActiveAgents = activeAgents.filter(id => id !== 'a0');
      
      if (otherActiveAgents.length > 0 && Math.random() < 0.3) { // 30% chance
        const targetAgent = AGENTS.find(a => a.id === otherActiveAgents[Math.floor(Math.random() * otherActiveAgents.length)]);
        
        if (targetAgent && commanderAgent) {
          const commands = [
            `${targetAgent.name}, report your current operations status.`,
            `${targetAgent.name}, prioritize the next high-value task.`,
            `All units, maintain optimal efficiency. ${targetAgent.name}, lead this operation.`,
            `${targetAgent.name}, coordinate with other agents for maximum throughput.`,
            `Team status: OPTIMAL. ${targetAgent.name}, continue current protocol.`
          ];
          
          const command = commands[Math.floor(Math.random() * commands.length)];
          addLog('A2A', `[${commanderAgent.name} -> ${targetAgent.name}]: ${command}`);
          
          // Show Commander dialogue
          if (Math.random() < 0.8) {
            showAgentDialogue('a0', 'idle');
          }
        }
      }
    }, 8000); // Every 8 seconds

    return () => clearInterval(commanderInterval);
  }, [activeAgents, showAgentDialogue]);

  // --- Random Agent Dialogues: Periodic chatter ---
  useEffect(() => {
    if (activeAgents.length < 1) return;

    // Random agent says something every 4-7 seconds
    const dialogueInterval = setInterval(() => {
      const randomAgentId = activeAgents[Math.floor(Math.random() * activeAgents.length)];
      showAgentDialogue(randomAgentId);
    }, 4000 + Math.random() * 3000); // Between 4-7 seconds

    return () => clearInterval(dialogueInterval);
  }, [activeAgents, showAgentDialogue]);

  // --- Render ---
  const selectedAgent = selectedAgentId ? AGENTS.find(a => a.id === selectedAgentId) || null : null;

  // Show results page if requested
  if (showResultsPage) {
    return (
      <AgentResultsPage
        agents={AGENTS}
        results={taskResults}
        onBack={() => setShowResultsPage(false)}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-gray-200 overflow-hidden font-sans selection:bg-neon-green selection:text-black">
      <WalletBar onViewResults={() => setShowResultsPage(true)} />
      
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Left Sidebar: Agent Deck */}
        <div className="w-80 bg-black/40 border-r border-white/10 flex flex-col z-30 backdrop-blur-sm">
          <div className="p-4 border-b border-white/10">
            <h2 className="text-sm font-bold text-gray-400 font-mono uppercase tracking-widest">Agent Deck</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {AGENTS.map(agent => (
              <AgentCard 
                key={agent.id} 
                agent={agent} 
                isActive={activeAgents.includes(agent.id)}
                onToggle={() => toggleAgent(agent.id)}
                onClick={() => setSelectedAgentId(agent.id)}
                status={agentStatuses[agent.id]}
                isAutoMode={operationMode === 'auto'}
                isMinting={mintingAgents.has(agent.id)}
                isDeactivating={deactivatingAgents.has(agent.id)}
                isOnChain={!!onChainAgents[agent.id]}
              />
            ))}
          </div>
        </div>

        {/* Center: Flow Canvas */}
        <div className="flex-1 relative flex flex-col">
          {/* Mode Control - Top Right Corner */}
          <div className="absolute top-4 right-4 z-50">
            <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md border border-white/20 rounded-lg px-3 py-2">
              <button
                onClick={() => setOperationMode('manual')}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                  operationMode === 'manual' 
                    ? 'bg-[#39ff14] text-black' 
                    : 'bg-white/10 text-white/50 hover:bg-white/20'
                }`}
              >
                MANUAL
              </button>
              <button
                onClick={() => setOperationMode('auto')}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                  operationMode === 'auto' 
                    ? 'bg-[#39ff14] text-black' 
                    : 'bg-white/10 text-white/50 hover:bg-white/20'
                }`}
              >
                AUTO
              </button>
              {operationMode === 'auto' && (
                <div className="ml-2 pl-2 border-l border-white/20 flex items-center gap-2">
                  <input
                    type="number"
                    value={commanderBudget}
                    onChange={(e) => setCommanderBudget(Number(e.target.value))}
                    className="w-16 bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white"
                    min="0"
                    step="10"
                  />
                  <span className="text-xs text-white/70">USDC</span>
                  <div className="ml-2 text-xs">
                    <span className="text-[#39ff14] font-mono">{(commanderBudget - budgetSpent).toFixed(1)}</span>
                    <span className="text-white/50"> left</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex-1 relative">
             <FlowCanvas 
                agents={AGENTS} 
                activeAgents={activeAgents}
                streamingEdges={streamingEdges}
                onNodePositionsChange={setAgentPositions}
                activeDialogue={activeDialogue}
                onCloseDialogue={handleCloseDialogue}
             />
          </div>
          
          {/* Bottom: Console */}
          <div className="h-48 z-30">
            <ConsolePanel logs={logs} />
          </div>
        </div>

        {/* Right Sidebar: Details Panel (Conditional) */}
        <AgentDetailPanel 
          agent={selectedAgent} 
          onClose={() => setSelectedAgentId(null)} 
        />

      </div>
      
      {/* Toast Notifications */}
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
        style={{
          marginTop: '60px'
        }}
      />
    </div>
  );
};

export default App;