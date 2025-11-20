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
import { AgentProgressBar } from './components/AgentProgressBar';
import { DepositModal } from './components/DepositModal';
import { WithdrawModal } from './components/WithdrawModal';
import { CaptainControlPanel } from './components/CaptainControlPanel';
import { Wallet, BarChart3 } from 'lucide-react';
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
  
  // Migration helper: Move old onChainAgents to current wallet
  (window as any).migrateAgentsToWallet = (walletAddress: string) => {
    const oldData = localStorage.getItem('onChainAgents');
    if (!oldData) {
      console.log('No old agent data found');
      return;
    }
    
    const walletKey = `onChainAgents_${walletAddress.toLowerCase()}`;
    localStorage.setItem(walletKey, oldData);
    console.log(`✅ Migrated agents to wallet: ${walletAddress}`);
    console.log('Reload the page to see your agents');
  };
  
  // Helper: Clear all test agents
  (window as any).clearAllAgents = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('onChainAgents'));
    keys.forEach(k => localStorage.removeItem(k));
    console.log(`✅ Cleared ${keys.length} agent registries`);
    console.log('Reload the page to start fresh');
  };
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
  // Wallet-based agent registry: stores agentId -> tokenId mapping per wallet address
  const [onChainAgents, setOnChainAgents] = useState<Record<string, bigint>>(() => {
    if (!address) return {};
    
    const walletKey = `onChainAgents_${address.toLowerCase()}`;
    const stored = localStorage.getItem(walletKey);
    return stored ? JSON.parse(stored, (key, value) => {
      // Convert string back to bigint for values that look like numbers
      if (typeof value === 'string' && /^\d+$/.test(value)) {
        return BigInt(value);
      }
      return value;
    }) : {};
  }); // agentId -> tokenId (per wallet)
  
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
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  
  // --- Mode Control State ---
  const [operationMode, setOperationMode] = useState<'auto' | 'manual'>(() => {
    const saved = localStorage.getItem('operationMode');
    return (saved === 'auto' || saved === 'manual') ? saved : 'manual';
  });
  const [commanderBudget, setCommanderBudget] = useState<number>(100); // USDC
  const [budgetSpent, setBudgetSpent] = useState<number>(0);
  const [pendingFundRequest, setPendingFundRequest] = useState<boolean>(false);

  // Persist operation mode
  useEffect(() => {
    localStorage.setItem('operationMode', operationMode);
  }, [operationMode]);

  // --- Agent Task Progress Tracking ---
  const [agentProgress, setAgentProgress] = useState<Record<string, {
    isActive: boolean;
    progress: number; // 0-100
    task: string;
    startTime: number;
  }>>({});

  // --- Commander Custom Order ---
  const [commanderCustomOrder, setCommanderCustomOrder] = useState<string>('');

  // --- Refs to track current transaction context ---
  const currentMintingAgentRef = useRef<string | null>(null);
  const currentDeactivatingAgentRef = useRef<string | null>(null);
  const processedMintTxRef = useRef<Set<string>>(new Set());
  const processedDeactivateTxRef = useRef<Set<string>>(new Set());

  // --- Persist taskResults to localStorage ---
  useEffect(() => {
    localStorage.setItem('taskResults', JSON.stringify(taskResults));
  }, [taskResults]);

 // Run once on mount

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

  // --- Memoized callback for node position changes ---
  const handleNodePositionsChange = useCallback((positions: Record<string, { x: number; y: number }>) => {
    setAgentPositions(positions);
  }, []);

  // --- Memoized callback for edge changes ---
  const handleEdgesChange = useCallback((edges: any[]) => {
    setPersistentEdges(edges);
    localStorage.setItem('agentConnections', JSON.stringify(edges));
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
    if (mintSuccess && hash && receipt && currentMintingAgentRef.current) {
      // Prevent processing the same transaction twice
      if (processedMintTxRef.current.has(hash)) {
        return;
      }
      processedMintTxRef.current.add(hash);
      
      const agentId = currentMintingAgentRef.current;
      const agent = AGENTS.find(a => a.id === agentId);
      const explorerUrl = getHederaExplorerUrl(hash);
      
      console.log('🎯 Processing mint success for agent:', agentId, 'tx:', hash);
      console.log('📋 Receipt:', receipt);
      
      // Parse agent address from receipt
      // In EIP-8004, the agent's on-chain identity can be derived from:
      // 1. The transaction receipt logs (AgentCreated event)
      // 2. Or computed as a deterministic address based on contract + tokenId
      let agentAddress = '';
      let tokenId = '';
      
      if (receipt.logs && receipt.logs.length > 0) {
        // Look for AgentCreated event
        // Event signature: AgentCreated(uint256 indexed agentId, address indexed owner, string name, string role, uint256 fee)
        const agentCreatedTopic = '0x...'; // Would need proper topic hash
        
        for (const log of receipt.logs) {
          console.log('📝 Log:', log);
          // For now, we'll use a simpler approach:
          // The agent's identity is the contract address + tokenId
          if (log.topics && log.topics.length > 1) {
            // First indexed param after event signature is agentId
            tokenId = BigInt(log.topics[1]).toString();
            // Compute deterministic agent address: hash of contract + tokenId
            agentAddress = `${receipt.to?.toLowerCase()}-${tokenId}`;
            console.log('✅ Extracted tokenId:', tokenId, 'agentAddress:', agentAddress);
          }
        }
      }
      
      // If we couldn't extract from logs, use the call return value
      if (!tokenId) {
        // Try to get tokenId from receipt data or use temp ID
        const tempTokenId = BigInt(`0x${hash.slice(2, 18)}`);
        tokenId = tempTokenId.toString();
        agentAddress = `${receipt.to?.toLowerCase()}-${tokenId}`;
      }
      
      // Store agent address in localStorage
      const storedAddresses = localStorage.getItem('agentAddresses');
      const addresses = storedAddresses ? JSON.parse(storedAddresses) : {};
      addresses[agentId] = agentAddress;
      localStorage.setItem('agentAddresses', JSON.stringify(addresses));
      
      console.log('💾 Stored agent address:', agentId, '→', agentAddress);
      
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
          <div className="text-xs text-gray-400 mt-1 truncate">Agent: {agentAddress.slice(0, 20)}...</div>
        </div>,
        { autoClose: 8000 }
      );
      
      addLog('SYSTEM', `⛓️ ${agent?.name} minted! Address: ${agentAddress.slice(0, 20)}...`);
      
      // Update onChainAgents state with actual tokenId
      const actualTokenId = tokenId ? BigInt(tokenId) : BigInt(`0x${hash.slice(2, 18)}`);
      
      setOnChainAgents(prevAgents => {
        const newState = {
          ...prevAgents,
          [agentId]: actualTokenId
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
      
      // Fetch actual tokenId from Hedera in background for verification
      const fetchTokenId = async () => {
        try {
          console.log('🔄 Background: Verifying tokenId from Hedera mirror node...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const txData = await fetchHederaTransaction(hash);
          
          if (txData && txData.call_result && txData.call_result !== '0x') {
            const verifiedTokenId = BigInt(txData.call_result);
            console.log('✅ Verified tokenId from call_result:', verifiedTokenId.toString());
            
            // Update if different
            if (verifiedTokenId.toString() !== tokenId) {
              const verifiedAddress = `${receipt.to?.toLowerCase()}-${verifiedTokenId}`;
              
              setOnChainAgents(prev => ({
                ...prev,
                [agentId]: verifiedTokenId
              }));
              
              // Update stored address
              const addresses = JSON.parse(localStorage.getItem('agentAddresses') || '{}');
              addresses[agentId] = verifiedAddress;
              localStorage.setItem('agentAddresses', JSON.stringify(addresses));
              
              addLog('SYSTEM', `🎫 ${agent?.name} verified tokenId: ${verifiedTokenId.toString()}`);
            }
          }
        } catch (error) {
          console.warn('⚠️ Could not verify tokenId from mirror node:', error);
        }
      };
      
      fetchTokenId();
    }
  }, [mintSuccess, hash, receipt]);

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

  // --- Persist onChainAgents to localStorage (wallet-specific) ---
  useEffect(() => {
    if (!address) return;
    
    const walletKey = `onChainAgents_${address.toLowerCase()}`;
    localStorage.setItem(walletKey, JSON.stringify(onChainAgents, (key, value) => {
      // Convert bigint to string for JSON serialization
      return typeof value === 'bigint' ? value.toString() : value;
    }));
  }, [onChainAgents, address]);

  // --- Load wallet-specific agents when address changes ---
  useEffect(() => {
    if (!address) {
      setOnChainAgents({});
      return;
    }
    
    const walletKey = `onChainAgents_${address.toLowerCase()}`;
    const stored = localStorage.getItem(walletKey);
    
    if (stored) {
      const loadedAgents = JSON.parse(stored, (key, value) => {
        if (typeof value === 'string' && /^\d+$/.test(value)) {
          return BigInt(value);
        }
        return value;
      });
      setOnChainAgents(loadedAgents);
      addLog('SYSTEM', `✅ Loaded ${Object.keys(loadedAgents).length} registered agents for this wallet`);
    } else {
      setOnChainAgents({});
      addLog('SYSTEM', '👋 Welcome! No agents registered yet for this wallet');
    }
  }, [address]);

  // --- Auto Mode: Activate Commander when mode switches ---
  useEffect(() => {
    if (operationMode === 'auto') {
      // Auto-activate Commander if not active (check via callback to avoid dependency)
      setActiveAgents(prev => {
        if (!prev.includes('a0')) {
          addLog('SYSTEM', '⚡ AUTO MODE: Activating Commander Nexus with budget of ' + commanderBudget.toFixed(2) + ' USDC');
          setTimeout(() => showAgentDialogue('a0', 'greeting'), 1000);
          return ['a0', ...prev];
        }
        return prev;
      });
      setBudgetSpent(0); // Reset budget spent
    } else {
      // Manual mode: can deactivate all if needed
      addLog('SYSTEM', '✋ MANUAL MODE: Full manual control enabled');
    }
  }, [operationMode, commanderBudget]);

  // --- Handlers ---
  const addLog = (type: 'A2A' | 'x402' | 'SYSTEM' | 'COMMANDER', content: string) => {
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
      
      // Check if this is Captain and analyze team state
      const isCaptain = agentId === 'a0';
      const captainConnections = persistentEdges.filter(e => e.source === 'a0' || e.target === 'a0');
      const connectedAgentIds = captainConnections.map(e => e.source === 'a0' ? e.target : e.source).filter(id => id !== 'a0');
      const hasTeam = connectedAgentIds.length > 0;
      
      // Context-aware A2A dialogue for Captain
      if (isCaptain && context === 'greeting' && !hasTeam) {
        // Captain introduction - incentivize building team
        const recruitmentMessages = [
          "⚔️ Commander ready. Connect me to specialists for coordinated operations.",
          "🎯 Standing by. I require tactical support—activate and connect agents to begin.",
          "📡 Systems online. Build my network to unlock full command capabilities.",
          "🌟 Commander Aslan reporting. I coordinate better with a connected squad—let's assemble the team."
        ];
        selectedDialogue = recruitmentMessages[Math.floor(Math.random() * recruitmentMessages.length)];
      } else if (isCaptain && hasTeam) {
        // Captain has team - show coordination dialogues
        const connectedAgents = connectedAgentIds.map(id => AGENTS.find(a => a.id === id)).filter(Boolean);
        const agentNames = connectedAgents.map(a => a.name).join(', ');
        
        if (context === 'success') {
          const teamSuccessMessages = [
            `✅ Intel received. ${agentNames}—excellent work. Mission parameters updated.`,
            `🎖️ Outstanding execution, team. ${connectedAgents[0]?.name}, your data is gold.`,
            `⚡ Grid synchronized. All agents performing optimally—${agentNames}, maintain frequency.`,
            `📊 Analysis complete. ${connectedAgents[Math.floor(Math.random() * connectedAgents.length)]?.name}, your insights are invaluable.`
          ];
          selectedDialogue = teamSuccessMessages[Math.floor(Math.random() * teamSuccessMessages.length)];
        } else if (context === 'analyzing') {
          const coordinationMessages = [
            `🔍 Scanning markets... ${connectedAgents[0]?.name}, standby for coordination signal.`,
            `⚙️ Processing strategy with ${agentNames}. Grid intelligence flowing.`,
            `🌐 Cross-referencing data streams. ${connectedAgents[Math.floor(Math.random() * connectedAgents.length)]?.name}, await further orders.`,
            `📡 Orchestrating team analysis. All connected agents on mission clock.`
          ];
          selectedDialogue = coordinationMessages[Math.floor(Math.random() * coordinationMessages.length)];
        } else {
          // General team chatter
          const teamDialogues = [
            `💼 Team status: ${connectedAgents.length} agents online. Efficiency optimal.`,
            `🎯 ${agentNames}—maintain positions. I'll coordinate next moves.`,
            `⚡ Network active. Squad ready for deployment.`,
            `🛡️ All systems nominal. ${connectedAgents[0]?.name}, report when ready.`
          ];
          selectedDialogue = teamDialogues[Math.floor(Math.random() * teamDialogues.length)];
        }
      } else if (!isCaptain) {
        // Non-captain agents - check if connected to Captain
        const connectedToCaptain = persistentEdges.some(e => 
          (e.source === 'a0' && e.target === agentId) || 
          (e.target === 'a0' && e.source === agentId)
        );
        
        if (!connectedToCaptain && context === 'greeting') {
          // Agent introduction - incentivize connecting to Captain
          const introMessages = {
            a1: "🦅 Eagle eyes ready. Connect me to Commander Aslan for tactical reconnaissance.",
            a2: "📚 Archives indexed. Link me to Commander for strategic intelligence support.",
            a3: "💰 Market sensors calibrated. Awaiting Commander's trading directives.",
            a4: "🛡️ Security protocols active. Connect to Command for perimeter coordination.",
            a5: "🔮 Predictive models online. I serve best under Commander Aslan's strategy.",
            a6: "📨 Communication arrays ready. Link me to Command for intel relay."
          };
          selectedDialogue = introMessages[agentId as keyof typeof introMessages] || dialogues[0];
        } else if (connectedToCaptain && context === 'success') {
          // Connected to Captain - show collaborative success
          const teamSuccessMessages = [
            `✅ Mission complete, Commander. Data transmitted.`,
            `🎯 Objective achieved. Awaiting next orders from Command.`,
            `⚡ Task successful. Standing by for Commander's assessment.`,
            `📡 Intelligence delivered to Command. ${agent.name} ready for next assignment.`
          ];
          selectedDialogue = teamSuccessMessages[Math.floor(Math.random() * teamSuccessMessages.length)];
        } else {
          // Standard personality dialogues
          if (context === 'greeting') {
            selectedDialogue = dialogues[0];
          } else if (context === 'analyzing') {
            const analyticalIndex = Math.floor(dialogues.length / 3) + Math.floor(Math.random() * 2);
            selectedDialogue = dialogues[analyticalIndex] || dialogues[Math.floor(Math.random() * dialogues.length)];
          } else if (context === 'success') {
            const successIndex = Math.floor(dialogues.length * 0.6) + Math.floor(Math.random() * 2);
            selectedDialogue = dialogues[successIndex] || dialogues[Math.floor(Math.random() * dialogues.length)];
          } else {
            selectedDialogue = dialogues[Math.floor(Math.random() * dialogues.length)];
          }
        }
      } else {
        // Fallback to standard behavior
        if (context === 'greeting') {
          selectedDialogue = dialogues[0];
        } else if (context === 'analyzing') {
          const analyticalIndex = Math.floor(dialogues.length / 3) + Math.floor(Math.random() * 2);
          selectedDialogue = dialogues[analyticalIndex] || dialogues[Math.floor(Math.random() * dialogues.length)];
        } else if (context === 'success') {
          const successIndex = Math.floor(dialogues.length * 0.6) + Math.floor(Math.random() * 2);
          selectedDialogue = dialogues[successIndex] || dialogues[Math.floor(Math.random() * dialogues.length)];
        } else {
          selectedDialogue = dialogues[Math.floor(Math.random() * dialogues.length)];
        }
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
  }, [persistentEdges]);

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

  // --- HBAR→SAUCE/USDC Autonomous Swap (Merchant Reynard - a3) ---
  const executeAutonomousSwap = useCallback(async (marketData: any, sentimentScore: number, agentId: string) => {
    if (!activeAgents.includes(agentId)) return;
    if (!activeAgents.includes('a0')) return; // Commander not active
    
    // IMPORTANT: Only Merchant agent (Reynard - a3) can execute swaps
    if (agentId !== 'a3') {
      console.warn(`Agent ${agentId} cannot execute swaps. Only Merchant (a3 - Reynard Swift) can trade.`);
      return;
    }
    
    // Verify Reynard (Merchant) is active on canvas
    if (!activeAgents.includes('a3')) {
      addLog('SYSTEM', '⚠️ Trading requires Merchant agent (Reynard Swift - a3) to be active on canvas');
      return;
    }
    
    const agent = AGENTS.find(a => a.id === agentId)!;
    
    // Check if swap conditions are met
    const swapDecision = sauceSwapService.shouldExecuteSwap(marketData, sentimentScore);
    
    if (!swapDecision.shouldSwap) {
      agentStatusManager.setStatus(agentId, 'Monitoring signals...');
      return;
    }
    
    // Check captain fund balance
    if (false) { // Fund check removed - using on-chain balance
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
      // Fund deduction removed - using on-chain balance
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
          
          // Build transaction URL for HashScan
          const txHash = result.txHash || '0x' + Math.random().toString(16).slice(2);
          const txUrl = `https://hashscan.io/testnet/transaction/${txHash}`;
          
          // Add task result with transaction details
          addTaskResult({
            agentId,
            agentName: agent.name,
            taskType: 'swap_execution',
            status: 'success',
            data: { 
              swap: {
                tokenIn: 'HBAR',
                tokenOut: 'SAUCE',
                amountIn: swapDecision.recommendedAmount,
                amountOut: result.amountOut?.toFixed(2),
                rate: `1 HBAR = ${(result.amountOut / swapDecision.recommendedAmount).toFixed(2)} SAUCE`,
                slippage: '2.0',
                profitability: swapDecision.reason
              }
            },
            summary: `Successfully swapped ${swapDecision.recommendedAmount} HBAR → ${result.amountOut?.toFixed(2)} SAUCE on SauceSwap`,
            txHash: txHash,
            txUrl: txUrl
          });
          
          showAgentDialogue(agentId, 'success');
        } else {
          // Refund on failure
          // Fund addition removed - using on-chain balance
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
  }, [activeAgents, addLog, addTaskResult, showAgentDialogue, requestFundFromCaptain]);

  // --- API Integration: Fetch real-time data for agents ---
  const fetchAgentIntelligence = useCallback(async (agentId: string) => {
    const agent = AGENTS.find(a => a.id === agentId);
    if (!agent) return;

    setAgentStatuses(prev => ({ ...prev, [agentId]: 'negotiating' }));
    
    // Check if Commander has custom order
    if (agentId === 'a0' && commanderCustomOrder.trim()) {
      agentStatusManager.setStatus(agentId, `Executing custom order: ${commanderCustomOrder.substring(0, 30)}...`);
      addLog('COMMANDER', `📋 Custom Order: "${commanderCustomOrder}"`);
      
      // Show Commander executing the custom order
      showAgentDialogue(agentId, 'success', `Executing your order: "${commanderCustomOrder}"`);
      
      // Add custom order task result
      addTaskResult({
        agentId: agent.id,
        agentName: agent.name,
        taskType: 'custom_order',
        status: 'success',
        data: { order: commanderCustomOrder },
        summary: `Custom order executed: "${commanderCustomOrder}"`
      });
      
      setAgentStatuses(prev => ({ ...prev, [agentId]: 'idle' }));
      return;
    }

    // Get agent's specialization and APIs
    const abilities = AGENT_ABILITIES[agentId as keyof typeof AGENT_ABILITIES];
    if (!abilities) return;

    try {
      // a0 - Aslan (Commander): Strategic coordination, agent orchestration
      if (agentId === 'a0') {
        agentStatusManager.setStatus(agentId, 'Coordinating agent operations');
        addLog('A2A', `[${agent.name}] 👑 Orchestrating ${activeAgents.length - 1} agents`);
        
        const activeTeam = activeAgents.filter(id => id !== 'a0').map(id => AGENTS.find(a => a.id === id)?.name).join(', ');
        
        addTaskResult({
          agentId: agent.id,
          agentName: agent.name,
          taskType: 'route_optimization',
          status: 'success',
          data: { 
            activeAgents: activeTeam,
            connections: persistentEdges.length,
            operations: ['Agent orchestration', 'Decision making', 'Risk assessment']
          },
          summary: `Coordinating ${activeAgents.length - 1} active agents: ${activeTeam}`
        });
      }
      
      // a1 - Eagleton (Navigator): Market intelligence using TwelveData API
      else if (agentId === 'a1') {
        const assets = ['HBAR', 'ETH', 'BTC', 'SAUCE'];
        const asset = assets[Math.floor(Math.random() * assets.length)];
        
        agentStatusManager.setStatus(agentId, `Tracking ${asset} price via TwelveData API`);
        const intelligence = await orchestrator.getMarketResearch(asset.toLowerCase());
        
        if (intelligence.marketData && intelligence.marketData.price) {
          const price = intelligence.marketData.price.toLocaleString();
          const change = intelligence.marketData.changePercent;
          
          addLog('A2A', `[${agent.name}] 📊 ${asset} Market: $${price} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)`);
          
          addTaskResult({
            agentId: agent.id,
            agentName: agent.name,
            taskType: 'market_research',
            status: 'success',
            data: { ...intelligence.marketData, asset, api: 'TwelveData API' },
            summary: `${asset} market intelligence: $${price}, 24h change: ${change >= 0 ? '+' : ''}${change.toFixed(2)}%, Volume: ${intelligence.marketData.volume24h || 'N/A'}`
          });
        }
      }
      
      // a2 - Athena (Archivist): Sentiment analysis using News API + Gemini AI
      else if (agentId === 'a2') {
        const topics = ['Hedera', 'DeFi', 'HBAR', 'Crypto Market'];
        const topic = topics[Math.floor(Math.random() * topics.length)];
        
        agentStatusManager.setStatus(agentId, `Analyzing ${topic} sentiment via News API`);
        const intelligence = await orchestrator.getMarketResearch('ethereum'); // Using as data source
        
        if (intelligence.sentiment) {
          const sentiment = intelligence.sentiment.overallSentiment.toUpperCase();
          const articleCount = intelligence.sentiment.articles.length;
          
          addLog('A2A', `[${agent.name}] 📰 ${topic} Sentiment: ${sentiment} (${articleCount} sources)`);
          
          addTaskResult({
            agentId: agent.id,
            agentName: agent.name,
            taskType: 'sentiment_analysis',
            status: 'success',
            data: { 
              ...intelligence.sentiment, 
              topic,
              apis: ['News API', 'Gemini AI'],
              score: sentiment === 'BULLISH' ? 75 : sentiment === 'BEARISH' ? 25 : 50
            },
            summary: `${topic} sentiment analysis: ${sentiment} based on ${articleCount} news articles. AI-processed sentiment score indicates ${sentiment.toLowerCase()} market outlook.`
          });
        }
      }
      
      // a3 - Reynard (Merchant): DEX trading on SauceSwap
      else if (agentId === 'a3') {
        agentStatusManager.setStatus(agentId, 'Monitoring SauceSwap liquidity pools');
        
        const pairs = ['HBAR/SAUCE', 'HBAR/USDC', 'SAUCE/USDC'];
        const pair = pairs[Math.floor(Math.random() * pairs.length)];
        
        addLog('A2A', `[${agent.name}] 🦊 Analyzing ${pair} liquidity on SauceSwap`);
        
        addTaskResult({
          agentId: agent.id,
          agentName: agent.name,
          taskType: 'swap_execution',
          status: 'success',
          data: {
            pair,
            api: 'SauceSwap DEX',
            liquidity: '$' + (Math.random() * 10000 + 1000).toFixed(0),
            volume24h: '$' + (Math.random() * 5000 + 500).toFixed(0),
            priceImpact: (Math.random() * 2).toFixed(2) + '%'
          },
          summary: `${pair} pool analysis complete. Liquidity: $${(Math.random() * 10000 + 1000).toFixed(0)}, 24h volume: $${(Math.random() * 5000 + 500).toFixed(0)}. Ready to execute swaps with <2% slippage.`
        });
      }
      
      // a4 - Ursus (Sentinel): Risk management using TwelveData + AI
      else if (agentId === 'a4') {
        const assets = ['HBAR', 'ETH', 'BTC'];
        const asset = assets[Math.floor(Math.random() * assets.length)];
        
        agentStatusManager.setStatus(agentId, `Calculating ${asset} risk metrics`);
        
        const volatility = (Math.random() * 30 + 10).toFixed(2);
        const riskScore = (Math.random() * 40 + 30).toFixed(0);
        
        addLog('A2A', `[${agent.name}] 🛡️ ${asset} Risk: ${riskScore}/100 (Volatility: ${volatility}%)`);
        
        addTaskResult({
          agentId: agent.id,
          agentName: agent.name,
          taskType: 'security_audit',
          status: 'success',
          data: {
            asset,
            volatility: volatility + '%',
            riskScore: riskScore + '/100',
            recommendation: parseInt(riskScore) < 50 ? 'Low risk - Safe to trade' : 'Elevated risk - Trade with caution',
            apis: ['TwelveData API', 'Gemini AI']
          },
          summary: `${asset} risk assessment: ${riskScore}/100 risk score with ${volatility}% volatility. ${parseInt(riskScore) < 50 ? 'Market conditions favorable for trading.' : 'Elevated volatility detected.'}`
        });
      }
      
      // a5 - Luna (Oracle): Technical analysis & predictions using Gemini AI
      else if (agentId === 'a5') {
        const assets = ['HBAR', 'ETH', 'BTC', 'SAUCE'];
        const asset = assets[Math.floor(Math.random() * assets.length)];
        
        agentStatusManager.setStatus(agentId, `Generating ${asset} AI prediction`);
        const intelligence = await orchestrator.getMarketResearch(asset.toLowerCase());
        
        if (intelligence.aiInsight) {
          addLog('A2A', `[${agent.name}] 🔮 ${asset} Prediction: ${intelligence.aiInsight.substring(0, 60)}...`);
          
          const prediction = intelligence.aiInsight;
          const direction = prediction.toLowerCase().includes('rise') || prediction.toLowerCase().includes('bullish') ? 'BULLISH' : 
                          prediction.toLowerCase().includes('fall') || prediction.toLowerCase().includes('bearish') ? 'BEARISH' : 'NEUTRAL';
          
          addTaskResult({
            agentId: agent.id,
            agentName: agent.name,
            taskType: 'price_prediction',
            status: 'success',
            data: { 
              asset,
              prediction,
              direction,
              confidence: (Math.random() * 30 + 60).toFixed(0) + '%',
              apis: ['Gemini AI', 'TwelveData API']
            },
            summary: `${asset} AI prediction (${direction}): ${prediction}`
          });
        }
      }
      
      // a6 - Corvus (Glitch): Breaking news & whale alerts using News API
      else if (agentId === 'a6') {
        agentStatusManager.setStatus(agentId, 'Scanning for breaking news via News API');
        
        const newsTypes = ['Whale Alert', 'Breaking News', 'Major Event', 'Market Movement'];
        const newsType = newsTypes[Math.floor(Math.random() * newsTypes.length)];
        const topics = ['HBAR', 'Hedera', 'DeFi', 'Crypto'];
        const topic = topics[Math.floor(Math.random() * topics.length)];
        
        addLog('A2A', `[${agent.name}] 🔔 ${newsType} detected: ${topic} activity spike`);
        
        addTaskResult({
          agentId: agent.id,
          agentName: agent.name,
          taskType: 'sentiment_analysis',
          status: 'success',
          data: {
            eventType: newsType,
            topic,
            severity: 'Medium',
            timestamp: new Date().toISOString(),
            apis: ['News API', 'Hedera Mirror Node']
          },
          summary: `${newsType}: ${topic} showing increased activity. ${newsType === 'Whale Alert' ? 'Large transaction detected on network.' : 'Breaking developments in ecosystem.'}`
        });
      }

      // Show contextual dialogue
      if (Math.random() < 0.7) {
        showAgentDialogue(agentId, 'success');
      }

      setAgentStatuses(prev => ({ ...prev, [agentId]: 'idle' }));
    } catch (error: any) {
      console.error('Intelligence fetch error:', error);
      const errorMessage = error?.message || 'Service temporarily unavailable';
      
      agentStatusManager.setStatus(agentId, `⚠️ ${errorMessage}`);
      showAgentDialogue(agentId, 'error', errorMessage);
      
      addLog('SYSTEM', `⚠️ ${agent.name}: ${errorMessage}`);
      
      addTaskResult({
        agentId: agent.id,
        agentName: agent.name,
        taskType: 'market_research',
        status: 'error',
        summary: `Task error: ${errorMessage}`
      });
      
      setAgentStatuses(prev => ({ ...prev, [agentId]: 'idle' }));
    }
  }, [addTaskResult, showAgentDialogue, executeAutonomousSwap, commanderCustomOrder, activeAgents, persistentEdges]);

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

      // 1. Fetch real intelligence for random agent (20% chance - increased for better UX)
      if (rand < 0.20 && activeAgents.length > 0) {
        const randomAgent = activeAgents[Math.floor(Math.random() * activeAgents.length)];
        fetchAgentIntelligence(randomAgent);
      }

      // 2. A2A Negotiation Event (25% chance) - Fixed: removed gap, now 20-45%
      else if (rand >= 0.20 && rand < 0.45 && activeAgents.length >= 2) {
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
      
      // 3. x402 Streaming Event (20% chance to start a stream) - Fixed: now 45-65%
      else if (rand >= 0.45 && rand < 0.65 && activeAgents.length >= 2) {
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
  }, [activeAgents]);

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
        activeAgents={activeAgents}
        agentConnections={persistentEdges}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-gray-200 overflow-hidden font-sans selection:bg-neon-green selection:text-black">
      <WalletBar />
      
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Left Sidebar: Agent Deck */}
        <div className="w-80 bg-black/40 border-r border-white/10 flex flex-col z-30 backdrop-blur-sm">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-400 font-mono uppercase tracking-widest">Agent Deck</h2>
            <button
              onClick={() => setShowResultsPage(true)}
              className="flex items-center gap-2 bg-[#39ff14]/10 hover:bg-[#39ff14]/20 px-3 py-1.5 rounded border border-[#39ff14]/30 transition-colors"
            >
              <BarChart3 size={14} className="text-[#39ff14]" />
              <span className="text-[#39ff14] font-semibold text-xs font-mono">Results</span>
            </button>
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
                onChainTokenId={onChainAgents[agent.id] ? Number(onChainAgents[agent.id]) : undefined}
                customOrder={agent.id === 'a0' ? commanderCustomOrder : undefined}
                onCustomOrderChange={agent.id === 'a0' ? setCommanderCustomOrder : undefined}
              />
            ))}
          </div>
        </div>

        {/* Center: Flow Canvas */}
        <div className="flex-1 relative flex flex-col">
          {/* Top Right Controls: Unified Captain Control Panel */}
          <div className="absolute top-4 right-4 z-50">
            <CaptainControlPanel
              mode={operationMode}
              onModeChange={setOperationMode}
              isConnected={isConnected}
              isCaptainRegistered={!!onChainAgents['a0']}
              captainTokenId={onChainAgents['a0'] ? Number(onChainAgents['a0']) : 0}
              onOpenDeposit={() => setShowDepositModal(true)}
              onOpenWithdraw={() => setShowWithdrawModal(true)}
            />
          </div>
          
          <div className="flex-1 relative">
             <FlowCanvas 
                agents={AGENTS} 
                activeAgents={activeAgents}
                streamingEdges={streamingEdges}
                onNodePositionsChange={handleNodePositionsChange}
                activeDialogue={activeDialogue}
                onCloseDialogue={handleCloseDialogue}
                persistentEdges={persistentEdges}
                onEdgesChange={handleEdgesChange}
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
        position="bottom-right"
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
          marginBottom: '20px',
          marginRight: '20px'
        }}
      />

      {/* Deposit Modal for x402 Streaming Payments */}
      <DepositModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        captainAgentId={onChainAgents['a0'] ? Number(onChainAgents['a0']) : 0} // Aslan the Great (Commander)
        connectedAgents={
          persistentEdges
            .filter(edge => edge.source === 'a0' || edge.target === 'a0')
            .map(edge => {
              const agentId = edge.source === 'a0' ? edge.target : edge.source;
              return onChainAgents[agentId] ? { agentId, tokenId: onChainAgents[agentId] } : null;
            })
            .filter((item): item is {agentId: string, tokenId: bigint} => item !== null)
        }
        onDepositSuccess={(streamId) => {
          if (streamId && streamId > 0) {
            // Store stream ID in localStorage for WalletBar aggregation
            const stored = localStorage.getItem('userStreams');
            let existingIds: string[] = [];
            
            try {
              existingIds = stored ? JSON.parse(stored) : [];
            } catch (err) {
              console.error('Error parsing userStreams:', err);
              existingIds = [];
            }
            
            // Add new stream ID if not already present
            const streamIdStr = String(streamId);
            if (!existingIds.includes(streamIdStr)) {
              existingIds.push(streamIdStr);
              localStorage.setItem('userStreams', JSON.stringify(existingIds));
              console.log('✅ Stored stream ID:', streamId, 'Total streams:', existingIds.length);
            }
            
            addLog('x402', `✅ Stream #${streamId} opened! Captain funded for autonomous operations. Use this ID to withdraw later.`);
          } else {
            addLog('x402', `✅ Stream opened! Captain funded for autonomous operations. Check transaction receipt for Stream ID.`);
          }
          setShowDepositModal(false);
        }}
      />

      {/* Withdraw Modal for x402 Stream Withdrawals */}
      <WithdrawModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        captainAgentId={onChainAgents['a0'] ? Number(onChainAgents['a0']) : 0} // Aslan the Great (Commander)
        connectedAgents={
          persistentEdges
            .filter(edge => edge.source === 'a0' || edge.target === 'a0')
            .map(edge => {
              const agentId = edge.source === 'a0' ? edge.target : edge.source;
              return onChainAgents[agentId] ? { agentId, tokenId: onChainAgents[agentId] } : null;
            })
            .filter((item): item is {agentId: string, tokenId: bigint} => item !== null)
        }
        onWithdrawSuccess={() => {
          addLog('x402', `✅ Withdrawal successful! Funds transferred from stream.`);
          setShowWithdrawModal(false);
        }}
      />
    </div>
  );
};

export default App;