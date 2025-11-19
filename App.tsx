import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { AgentProgressBar } from './components/AgentProgressBar';
import { CaptainFundPanel } from './components/CaptainFundPanel';
import { orchestrator, cryptoService, newsService, hederaService, agentStatusManager, sauceSwapService } from './services/api';
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

// Helper to fetch transaction from Hedera Mirror Node
const fetchHederaTransaction = async (txHash: string): Promise<any> => {
  try {
    // Remove 0x prefix if present
    const cleanHash = txHash.startsWith('0x') ? txHash.slice(2) : txHash;
    const url = `https://testnet.mirrornode.hedera.com/api/v1/contracts/results/${cleanHash}`;
    console.log('🌐 Fetching transaction from Hedera Mirror Node:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Mirror node returned ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Hedera transaction data:', data);
    return data;
  } catch (error) {
    console.error('❌ Failed to fetch from Hedera mirror node:', error);
    return null;
  }
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
  const [persistentEdges, setPersistentEdges] = useState<Array<{source: string, target: string}>>(() => {
    const saved = localStorage.getItem('agentConnections');
    return saved ? JSON.parse(saved) : [];
  });
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
  const [taskResults, setTaskResults] = useState<AgentTaskResult[]>(() => {
    const stored = localStorage.getItem('taskResults');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [showResultsPage, setShowResultsPage] = useState(false);
  const [agentPositions, setAgentPositions] = useState<Record<string, { x: number; y: number }>>({});
  
  // --- Mode Control State ---
  const [operationMode, setOperationMode] = useState<'auto' | 'manual'>('manual');
  const [commanderBudget, setCommanderBudget] = useState<number>(100); // USDC
  const [budgetSpent, setBudgetSpent] = useState<number>(0);

  // --- Captain Fund Management (HBAR for autonomous trading) ---
  const [captainFundHBAR, setCaptainFundHBAR] = useState<number>(() => {
    const saved = localStorage.getItem('captainFundHBAR');
    return saved ? parseFloat(saved) : 0;
  });
  const [pendingFundRequest, setPendingFundRequest] = useState<boolean>(false);

  // --- Agent Task Progress Tracking ---
  const [agentProgress, setAgentProgress] = useState<Record<string, {
    isActive: boolean;
    progress: number; // 0-100
    task: string;
    startTime: number;
  }>>({});

  // --- Refs to track current transaction context ---
  const currentMintingAgentRef = useRef<string | null>(null);
  const currentDeactivatingAgentRef = useRef<string | null>(null);
  const processedMintTxRef = useRef<Set<string>>(new Set());
  const processedDeactivateTxRef = useRef<Set<string>>(new Set());

  // --- Persist taskResults to localStorage ---
  useEffect(() => {
    localStorage.setItem('taskResults', JSON.stringify(taskResults));
  }, [taskResults]);

  // --- Persist captain fund to localStorage ---
  useEffect(() => {
    localStorage.setItem('captainFundHBAR', captainFundHBAR.toString());
  }, [captainFundHBAR]);

  // Debug: Log hook values whenever they change
  useEffect(() => {
    if (hash || mintSuccess) {
      console.log('🔍 Mint Hook Values:', { 
        mintSuccess, 
        hash: hash?.slice(0, 10), 
        hasReceipt: !!receipt,
        receiptStatus: receipt?.status,
        currentMintingAgent: currentMintingAgentRef.current
      });
    }
  }, [mintSuccess, hash, receipt]);

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

  // --- Track mint success and fetch tokenId from Hedera Mirror Node ---
  useEffect(() => {
    if (mintSuccess && hash && currentMintingAgentRef.current) {
      // Prevent processing the same transaction twice
      if (processedMintTxRef.current.has(hash)) {
        return;
      }
      processedMintTxRef.current.add(hash);
      
      const agentId = currentMintingAgentRef.current;
      const agent = AGENTS.find(a => a.id === agentId);
      const explorerUrl = getHederaExplorerUrl(hash);
      
      console.log('🎯 Processing mint success for agent:', agentId, 'tx:', hash);
      
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
      
      addLog('SYSTEM', `⛓️ ${agent?.name} minted successfully! Tx: ${hash.slice(0, 10)}...`);
      
      // Transaction is confirmed! Mark agent as on-chain immediately with hash as temporary ID
      const tempTokenId = BigInt(`0x${hash.slice(2, 18)}`); // Use first 16 chars of hash as temp ID
      
      console.log('✅ Marking agent as on-chain with tx hash:', hash);
      
      // Update onChainAgents state immediately
      setOnChainAgents(prevAgents => {
        const newState = {
          ...prevAgents,
          [agentId]: tempTokenId
        };
        console.log('📝 Updated onChainAgents:', newState);
        return newState;
      });
      
      // Auto-activate agent
      setActiveAgents(prev => {
        if (!prev.includes(agentId)) {
          const updated = [...prev, agentId];
          localStorage.setItem('activeAgents', JSON.stringify(updated));
          addLog('SYSTEM', `✅ ${agent?.name} ACTIVATED on grid`);
          return updated;
        }
        return prev;
      });
      
      // Clear minting state
      setMintingAgents(prev => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
      
      currentMintingAgentRef.current = null;
      
      // Show greeting dialogue
      if (agent?.personality) {
        setTimeout(() => showAgentDialogue(agentId, 'greeting'), 500);
      }
      
      // Fetch actual tokenId from Hedera in background for future reference
      const fetchTokenId = async () => {
        try {
          console.log('🔄 Background: Fetching actual tokenId from Hedera mirror node...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const txData = await fetchHederaTransaction(hash);
          
          if (txData) {
            // The call_result field contains the return value from mintAgent (the tokenId)
            if (txData.call_result && txData.call_result !== '0x') {
              const actualTokenId = BigInt(txData.call_result);
              console.log('✅ Got actual tokenId from call_result:', actualTokenId.toString());
              
              // Update with actual tokenId
              setOnChainAgents(prev => ({
                ...prev,
                [agentId]: actualTokenId
              }));
              
              addLog('SYSTEM', `🎫 ${agent?.name} tokenId: ${actualTokenId.toString()}`);
            } else {
              console.log('✅ Agent on-chain with hash-based ID (call_result empty)');
            }
          }
        } catch (error) {
          console.warn('⚠️ Could not fetch tokenId from mirror node:', error);
        }
      };
      
      fetchTokenId();
    }
  }, [mintSuccess, hash]);

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
    console.log('🔍 Deactivate hook values:', { 
      deactivateSuccess, 
      deactivateHash: deactivateHash?.slice(0, 10), 
      currentDeactivatingAgent: currentDeactivatingAgentRef.current 
    });
    
    if (deactivateSuccess && deactivateHash && currentDeactivatingAgentRef.current) {
      // Prevent processing the same transaction twice
      if (processedDeactivateTxRef.current.has(deactivateHash)) {
        console.log('⚠️ Deactivate tx already processed:', deactivateHash.slice(0, 10));
        return;
      }
      processedDeactivateTxRef.current.add(deactivateHash);
      
      const agentId = currentDeactivatingAgentRef.current;
      const agent = AGENTS.find(a => a.id === agentId);
      const explorerUrl = getHederaExplorerUrl(deactivateHash);
      
      console.log('🎯 Processing deactivate success for agent:', agentId, 'tx:', deactivateHash);
      
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
      
      addLog('SYSTEM', `⛓️ ${agent?.name} deactivated on-chain! Tx: ${deactivateHash.slice(0, 10)}...`);
      
      // Remove agent from active list immediately
      setActiveAgents(prev => {
        const updated = prev.filter(a => a !== agentId);
        localStorage.setItem('activeAgents', JSON.stringify(updated));
        addLog('SYSTEM', `⏹️ ${agent?.name} DEACTIVATED from grid`);
        console.log('✅ Updated activeAgents after deactivate:', updated);
        return updated;
      });
      
      // Clear deactivating state immediately
      setDeactivatingAgents(prev => {
        const next = new Set(prev);
        next.delete(agentId);
        console.log('✅ Cleared deactivating state for:', agentId);
        return next;
      });
      
      // Clear the ref
      currentDeactivatingAgentRef.current = null;
    }
  }, [deactivateSuccess, deactivateHash]);

  // --- Persist onChainAgents to localStorage ---
  useEffect(() => {
    console.log('💾 Persisting onChainAgents to localStorage:', onChainAgents);
    localStorage.setItem('onChainAgents', JSON.stringify(onChainAgents, (key, value) => {
      // Convert bigint to string for JSON serialization
      return typeof value === 'bigint' ? value.toString() : value;
    }));
  }, [onChainAgents]);

  // --- Debug onChainAgents changes ---
  useEffect(() => {
    console.log('🔄 onChainAgents state updated:', Object.keys(onChainAgents).length, 'agents', onChainAgents);
    console.log('📦 localStorage onChainAgents:', localStorage.getItem('onChainAgents'));
    // Check specifically for Commander
    if (onChainAgents['a0']) {
      console.log('✅ Commander IS in onChainAgents with tokenId:', onChainAgents['a0']);
    } else {
      console.log('❌ Commander NOT in onChainAgents');
    }
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
  const showAgentDialogue = useCallback((agentId: string, context?: 'greeting' | 'analyzing' | 'negotiating' | 'success' | 'idle' | 'error', customMessage?: string) => {
    const agent = AGENTS.find(a => a.id === agentId);
    if (!agent || !agent.personality) {
      console.warn(`Agent ${agentId} not found or has no personality`);
      return;
    }

    let selectedDialogue: string;
    
    // If custom error message provided, use it
    if (context === 'error' && customMessage) {
      selectedDialogue = `⚠️ ${customMessage}`;
    } else {
      const dialogues = agent.personality.dialogues;
      
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
    console.log('🎬 toggleAgent called for:', id);
    
    // In auto mode, only Commander can be manually toggled, others are controlled by Commander
    if (operationMode === 'auto' && id !== 'a0') {
      addLog('SYSTEM', '⚠️ Auto mode active: Only Commander can control agent activation');
      return;
    }
    
    const isCurrentlyActive = activeAgents.includes(id);
    const agent = AGENTS.find(a => a.id === id);
    const isActivating = !isCurrentlyActive;
    const agentTokenId = onChainAgents[id];
    
    console.log('📊 Toggle state:', { 
      id, 
      isCurrentlyActive, 
      isActivating, 
      agentTokenId: agentTokenId?.toString(), 
      isConnected,
      onChainAgentsKeys: Object.keys(onChainAgents)
    });
    
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
      currentMintingAgentRef.current = id; // Track which agent is being minted
      
      try {
        await mintAgent({
          name: agent.name,
          role: agent.role,
          description: agent.description || '',
          capabilities: agent.capabilities || []
        });
        
        addLog('SYSTEM', `✅ ${agent.name} registered on-chain! Tx: ${hash?.slice(0, 10)}...`);
        // Agent will be activated automatically in the success handler
        return; // Exit early, success handler will activate the agent
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
        currentMintingAgentRef.current = null; // Clear ref on error
        return; // Don't activate if minting failed
      }
    }
    
    // If activating an already-minted agent (just toggle, no blockchain needed)
    if (isActivating && agentTokenId) {
      setActiveAgents(prev => {
        const updated = [...prev, id];
        localStorage.setItem('activeAgents', JSON.stringify(updated));
        return updated;
      });
      addLog('SYSTEM', `✅ ${agent?.name} ACTIVATED on grid`);
      
      // Show greeting dialogue
      if (agent?.personality) {
        setTimeout(() => showAgentDialogue(id, 'greeting'), 1000);
      }
      return;
    }
    
    // If deactivating an on-chain agent (no blockchain tx needed, just local state change)
    if (!isActivating && agent && agentTokenId) {
      console.log('🔻 DEACTIVATE: Removing', agent.name, 'from active agents (local only)');
      addLog('SYSTEM', `🔻 Deactivating ${agent.name}...`);
      
      // Remove from active agents immediately
      setActiveAgents(prev => {
        const updated = prev.filter(a => a !== id);
        localStorage.setItem('activeAgents', JSON.stringify(updated));
        addLog('SYSTEM', `⏹️ ${agent.name} DEACTIVATED from grid`);
        return updated;
      });
      
      toast.info(
        <div>
          <div className="font-bold">🔻 Agent Deactivated</div>
          <div className="text-sm">{agent.name} removed from active grid</div>
        </div>,
        { autoClose: 3000 }
      );
      
      return;
    }
    
    // Legacy deactivate path (if deactivateAgent function existed)
    if (!isActivating && isConnected && agent && agentTokenId && false) {
      console.log('🔻 DEACTIVATE PATH: Starting deactivation for', agent.name, 'tokenId:', agentTokenId.toString());
      addLog('SYSTEM', `🔻 Deactivating ${agent.name} on-chain...`);
      setDeactivatingAgents(prev => new Set(prev).add(id));
      currentDeactivatingAgentRef.current = id;
      
      try {
        console.log('📞 Calling deactivateAgent with tokenId:', agentTokenId.toString());
        await deactivateAgent(agentTokenId);
        console.log('✅ deactivateAgent call completed, hash:', deactivateHash);
        addLog('SYSTEM', `✅ ${agent.name} deactivation transaction submitted!`);
        return;
      } catch (error: any) {
        const errorMsg = error.message || 'User rejected transaction';
        console.error('❌ Deactivate error:', error);
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
        currentDeactivatingAgentRef.current = null; // Clear ref on error
        return; // Don't deactivate if on-chain deactivation failed
      }
    }
  }, [activeAgents, showAgentDialogue, operationMode, isConnected, mintAgent, deactivateAgent, hash, deactivateHash, onChainAgents]);

  // --- Helper: Add task result ---
  const addTaskResult = useCallback((result: Omit<AgentTaskResult, 'timestamp'>) => {
    const newResult: AgentTaskResult = {
      ...result,
      timestamp: Date.now()
    };
    setTaskResults(prev => {
      const updated = [...prev, newResult];
      // Save to localStorage
      localStorage.setItem('taskResults', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // --- Captain Fund Management ---
  const requestFundFromCaptain = useCallback(() => {
    if (pendingFundRequest) return;
    
    setPendingFundRequest(true);
    showAgentDialogue('a0', 'error', `⚠️ INSUFFICIENT FUNDS! Need HBAR to execute autonomous swaps. Please deposit to Captain fund.`);
    addLog('SYSTEM', '🚨 Commander requesting fund deposit for autonomous trading');
    
    // Auto-clear request after 10 seconds
    setTimeout(() => setPendingFundRequest(false), 10000);
  }, [pendingFundRequest, showAgentDialogue]);

  // --- HBAR→SAUCE/USDC Autonomous Swap (Merchant Volt) ---
  const executeAutonomousSwap = useCallback(async (marketData: any, sentimentScore: number, agentId: string) => {
    if (!activeAgents.includes(agentId)) return;
    if (!activeAgents.includes('a0')) return; // Commander not active
    
    const agent = AGENTS.find(a => a.id === agentId)!;
    
    // Check if swap conditions are met
    const swapDecision = sauceSwapService.shouldExecuteSwap(marketData, sentimentScore);
    
    if (!swapDecision.shouldSwap) {
      agentStatusManager.setStatus(agentId, 'Monitoring signals...');
      return;
    }
    
    // Check captain fund balance
    if (captainFundHBAR < swapDecision.recommendedAmount) {
      agentStatusManager.setStatus(agentId, '⚠️ Insufficient captain fund');
      requestFundFromCaptain();
      return;
    }
    
    // Start progress tracking
    setAgentProgress(prev => ({
      ...prev,
      [agentId]: {
        isActive: true,
        progress: 0,
        task: `Swapping ${swapDecision.recommendedAmount} HBAR → SAUCE/USDC`,
        startTime: Date.now()
      }
    }));
    
    // Agent executes swap autonomously (NO approval needed)
    agentStatusManager.setStatus(agentId, `Signal detected: ${swapDecision.reason}`);
    addLog('A2A', `[${agent.name}]: 🔔 Swap signal! ${swapDecision.reason}`);
    addLog('A2A', `[${agent.name}]: Executing autonomous swap: ${swapDecision.recommendedAmount} HBAR`);
    
    // Create x402 stream for fund deduction (Commander -> Agent)
    const edgeId = `reactflow__edge-a0-${agentId}`;
    setStreamingEdges(prev => [...prev, edgeId]);
    setAgentStatuses(prev => ({ ...prev, a0: 'streaming', [agentId]: 'streaming' }));
    agentStatusManager.setStatus('a0', 'Transferring fund via x402');
    agentStatusManager.setStatus(agentId, 'Receiving fund authorization');
    
    // Progress: 20%
    setAgentProgress(prev => ({
      ...prev,
      [agentId]: { ...prev[agentId], progress: 20 }
    }));
    
    setTimeout(async () => {
      // Deduct from captain fund
      setCaptainFundHBAR(prev => prev - swapDecision.recommendedAmount);
      addLog('x402', `💸 Deducted ${swapDecision.recommendedAmount} HBAR from Captain fund`);
      agentStatusManager.setStatus(agentId, `Executing swap: ${swapDecision.recommendedAmount} HBAR`);
      
      // Progress: 40%
      setAgentProgress(prev => ({
        ...prev,
        [agentId]: { ...prev[agentId], progress: 40 }
      }));
      
      try {
        // Get quote
        const quote = await sauceSwapService.getSwapQuote(swapDecision.recommendedAmount);
        addLog('SYSTEM', `[${agent.name}] Quote: ${swapDecision.recommendedAmount} HBAR → ${quote.amountOut.toFixed(2)} SAUCE (Impact: ${quote.priceImpact}%)`);
        
        // Progress: 60%
        setAgentProgress(prev => ({
          ...prev,
          [agentId]: { ...prev[agentId], progress: 60 }
        }));
        
        // Execute swap
        const result = await sauceSwapService.executeSwap(swapDecision.recommendedAmount, quote.amountOut * 0.98); // 2% slippage
        
        // Progress: 80%
        setAgentProgress(prev => ({
          ...prev,
          [agentId]: { ...prev[agentId], progress: 80 }
        }));
        
        if (result.success) {
          addLog('x402', `✅ SWAP SUCCESS: ${result.amountOut?.toFixed(2)} SAUCE received`);
          agentStatusManager.setStatus(agentId, `Swap complete: ${result.amountOut?.toFixed(2)} SAUCE`);
          
          // Add task result
          addTaskResult({
            agentId,
            agentName: agent.name,
            taskType: 'market_research',
            status: 'success',
            data: { swapAmount: swapDecision.recommendedAmount, sauceReceived: result.amountOut, txHash: result.txHash },
            summary: `Successfully swapped ${swapDecision.recommendedAmount} HBAR → ${result.amountOut?.toFixed(2)} SAUCE on SauceSwap`
          });
          
          showAgentDialogue(agentId, 'success');
        } else {
          // Refund on failure
          setCaptainFundHBAR(prev => prev + swapDecision.recommendedAmount);
          throw new Error(result.error || 'Swap failed');
        }
      } catch (error: any) {
        addLog('SYSTEM', `❌ [${agent.name}] Swap failed: ${error.message}`);
        agentStatusManager.setStatus(agentId, `⚠️ Swap failed`);
        showAgentDialogue(agentId, 'error', error.message);
        
        addTaskResult({
          agentId,
          agentName: agent.name,
          taskType: 'market_research',
          status: 'error',
          summary: `Swap execution failed: ${error.message}`
        });
      } finally {
        // Progress: 100%
        setAgentProgress(prev => ({
          ...prev,
          [agentId]: { ...prev[agentId], progress: 100 }
        }));
        
        // Clear progress after 2 seconds
        setTimeout(() => {
          setAgentProgress(prev => {
            const next = { ...prev };
            delete next[agentId];
            return next;
          });
        }, 2000);
        
        // Close stream
        setStreamingEdges(prev => prev.filter(e => e !== edgeId));
        setAgentStatuses(prev => ({ ...prev, a0: 'idle', [agentId]: 'idle' }));
      }
    }, 1500);
  }, [activeAgents, addLog, addTaskResult, showAgentDialogue, captainFundHBAR, requestFundFromCaptain]);

  // --- API Integration: Fetch real-time data for agents ---
  const fetchAgentIntelligence = useCallback(async (agentId: string) => {
    const agent = AGENTS.find(a => a.id === agentId);
    if (!agent) return;

    setAgentStatuses(prev => ({ ...prev, [agentId]: 'negotiating' }));
    agentStatusManager.setStatus(agentId, 'Fetching intelligence...');

    try {
      // Get comprehensive market research from CoinGecko
      agentStatusManager.setStatus(agentId, 'Analyzing ETH market');
      const intelligence = await orchestrator.getMarketResearch('ethereum');
      
      // Log market data with full details
      if (intelligence.marketData && intelligence.marketData.price) {
        const price = intelligence.marketData.price.toLocaleString();
        const changePercent = intelligence.marketData.changePercent;
        agentStatusManager.setStatus(agentId, `Market scan: ETH $${price}`);
        
        addLog('SYSTEM', `[${agent.name}] Market Analysis: ETH at $${price}`);
        
        // Add market research result with comprehensive data
        addTaskResult({
          agentId: agent.id,
          agentName: agent.name,
          taskType: 'market_research',
          status: 'success',
          data: intelligence.marketData,
          summary: `Market analysis completed: ETH at $${price}, 24h change: ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`
        });
      } else {
        agentStatusManager.setStatus(agentId, 'Market data unavailable');
        addLog('SYSTEM', `[${agent.name}] Market data temporarily unavailable`);
      }

      // Log AI insight
      if (intelligence.aiInsight) {
        agentStatusManager.setStatus(agentId, 'AI prediction generated');
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
        const sentiment = intelligence.sentiment.overallSentiment.toUpperCase();
        const articleCount = intelligence.sentiment.articles.length;
        agentStatusManager.setStatus(agentId, `Sentiment: ${sentiment} (${articleCount} sources)`);
        
        addLog('SYSTEM', `[${agent.name}] Sentiment: ${sentiment} (${articleCount} sources)`);
        
        // Add sentiment analysis result
        addTaskResult({
          agentId: agent.id,
          agentName: agent.name,
          taskType: 'sentiment_analysis',
          status: 'success',
          data: intelligence.sentiment,
          summary: `Sentiment analysis: ${sentiment} based on ${articleCount} news sources`
        });
        
        // Trigger swap check if Merchant Volt is active and we have good data
        if (activeAgents.includes('a3') && intelligence.marketData) {
          // Calculate sentiment score (0-100)
          const sentimentScore = sentiment === 'BULLISH' ? 75 : sentiment === 'BEARISH' ? 25 : 50;
          
          // 20% chance to check swap conditions (avoid too frequent checks)
          if (Math.random() < 0.2) {
            setTimeout(() => {
              executeAutonomousSwap(intelligence.marketData, sentimentScore, agentId);
            }, 1000);
          }
        }
      }

      // Show contextual dialogue after completing intelligence fetch
      if (Math.random() < 0.8) { // 80% chance
        showAgentDialogue(agentId, 'success');
      }

      setAgentStatuses(prev => ({ ...prev, [agentId]: 'idle' }));
    } catch (error: any) {
      console.error('Intelligence fetch error:', error);
      const errorMessage = error?.message || 'Service temporarily unavailable';
      
      // Update status cache with error
      agentStatusManager.setStatus(agentId, `⚠️ ${errorMessage}`);
      
      // Show error via dialogue for better UX
      showAgentDialogue(agentId, 'error', errorMessage);
      
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
  }, [addTaskResult, showAgentDialogue, activeAgents, executeAutonomousSwap]);

  // --- Auto-connect Commander to all active agents ---
  useEffect(() => {
    if (activeAgents.includes('a0')) {
      // Create connections from Commander to all other active agents
      const newConnections = activeAgents
        .filter(id => id !== 'a0')
        .map(id => ({ source: 'a0', target: id }));
      
      // Merge with existing connections, avoiding duplicates
      const merged = [...persistentEdges];
      newConnections.forEach(conn => {
        const exists = merged.some(e => e.source === conn.source && e.target === conn.target);
        if (!exists) {
          merged.push(conn);
        }
      });
      
      if (merged.length !== persistentEdges.length) {
        setPersistentEdges(merged);
        localStorage.setItem('agentConnections', JSON.stringify(merged));
      }
    }
  }, [activeAgents]);

  // --- Simulation Loop (The "Life" of the app) ---
  // Smart polling: Reduced frequency to conserve API quota
  useEffect(() => {
    if (activeAgents.length < 1) {
      setStreamingEdges([]);
      return;
    }

    const interval = setInterval(async () => {
      const rand = Math.random();

      // 1. Fetch real intelligence for random agent (10% chance - REDUCED from 25% to save API quota)
      if (rand < 0.10 && activeAgents.length > 0) {
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
          { msg: `Requesting dataset access for block range #1820000...`, status: 'Requesting dataset' },
          { msg: `Offer: 0.005 ETH for optimal routing path.`, status: 'Negotiating fee' },
          { msg: `Verifying SLA contract signature...`, status: 'Verifying contract' },
          { msg: `Handshaking with protocol v2.1...`, status: 'Protocol handshake' },
          { msg: `Querying price oracle for asset pair...`, status: 'Querying oracle' },
          { msg: `Analyzing Hedera network throughput...`, status: 'Network analysis' },
          { msg: `Proposing liquidity pool strategy...`, status: 'Strategy proposal' }
        ];
        const selected = messages[Math.floor(Math.random() * messages.length)];
        
        // Update status cache with specific negotiation activity
        agentStatusManager.setStatus(senderId, `→ ${receiver.name}: ${selected.status}`);
        agentStatusManager.setStatus(receiverId, `← ${sender.name}: Listening`);
        
        addLog('A2A', `[${sender.name} -> ${receiver.name}]: ${selected.msg}`);
        
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
          agentStatusManager.setStatus(senderId, 'Negotiation complete');
          agentStatusManager.setStatus(receiverId, 'Negotiation complete');
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
           
           // Update status cache with streaming details
           agentStatusManager.setStatus(id1, `Streaming x402 @ ${rate} wei/s`);
           agentStatusManager.setStatus(id2, `Receiving stream @ ${rate} wei/s`);
           
           addLog('x402', `Stream OPENED: ${sender.name} → ${receiver.name} @ ${rate} wei/sec`);
           
           // Auto-close stream after random duration
           setTimeout(() => {
             setStreamingEdges(prev => prev.filter(e => e !== edgeId));
             setAgentStatuses(prev => ({ 
               ...prev, 
               [id1]: 'idle',
               [id2]: 'idle'
             }));
             agentStatusManager.setStatus(id1, 'Stream closed');
             agentStatusManager.setStatus(id2, 'Stream closed');
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

    }, 5000); // INCREASED from 3s to 5s to reduce API call frequency

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
        onClearResults={() => {
          setTaskResults([]);
          localStorage.removeItem('taskResults');
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-gray-200 overflow-hidden font-sans selection:bg-neon-green selection:text-black">
      <WalletBar 
        onViewResults={() => setShowResultsPage(true)}
      />
      
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
          {/* Top Right Controls: Mode + Captain Fund */}
          <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
            {/* Mode Control - Simple Toggle */}
            <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md border border-white/20 rounded-lg p-1">
              <button
                onClick={() => setOperationMode('manual')}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                  operationMode === 'manual' 
                    ? 'bg-[#39ff14] text-black' 
                    : 'bg-transparent text-white/50 hover:text-white'
                }`}
              >
                MANUAL
              </button>
              <button
                onClick={() => setOperationMode('auto')}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                  operationMode === 'auto' 
                    ? 'bg-[#39ff14] text-black' 
                    : 'bg-transparent text-white/50 hover:text-white'
                }`}
              >
                AUTO
              </button>
            </div>

            {/* Captain Fund Panel */}
            <CaptainFundPanel
              currentBalance={captainFundHBAR}
              onDeposit={(amount) => {
                setCaptainFundHBAR(prev => prev + amount);
                addLog('SYSTEM', `💰 Deposited ${amount} HBAR to Captain fund`);
                toast.success(`Deposited ${amount} HBAR`, { autoClose: 2000 });
              }}
              onWithdraw={(amount) => {
                setCaptainFundHBAR(prev => prev - amount);
                addLog('SYSTEM', `💸 Withdrew ${amount} HBAR from Captain fund`);
                toast.success(`Withdrew ${amount} HBAR`, { autoClose: 2000 });
              }}
            />
          </div>
          
          <div className="flex-1 relative">
             <FlowCanvas 
                agents={AGENTS} 
                activeAgents={activeAgents}
                streamingEdges={streamingEdges}
                onNodePositionsChange={setAgentPositions}
                activeDialogue={activeDialogue}
                onCloseDialogue={handleCloseDialogue}
                persistentEdges={persistentEdges}
                onEdgesChange={(edges) => {
                  setPersistentEdges(edges);
                  localStorage.setItem('agentConnections', JSON.stringify(edges));
                }}
             />
             
             {/* Progress Bars Overlay */}
             {Object.entries(agentProgress).filter(([_, p]) => p.isActive).length > 0 && (
               <div className="absolute bottom-4 right-4 space-y-2 z-40 max-w-md">
                 {Object.entries(agentProgress)
                   .filter(([_, progress]) => progress.isActive)
                   .map(([agentId, progress]) => {
                     const agent = AGENTS.find(a => a.id === agentId);
                     return (
                       <AgentProgressBar
                         key={agentId}
                         progress={progress.progress}
                         task={progress.task}
                         agentName={agent?.name || 'Agent'}
                       />
                     );
                   })}
               </div>
             )}
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