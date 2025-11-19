import React, { useCallback, useMemo, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Node,
  Edge,
  NodeProps,
  Handle,
  Position,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
} from 'reactflow';
import { AgentMetadata } from '../types';

// --- Custom Agent Node Component (defined outside to prevent re-creation) ---
const AgentNode = React.memo(({ data }: NodeProps) => {
  const { agent, dialogue, onCloseDialogue } = data;
  const spriteUrl = `https://api.dicebear.com/9.x/pixel-art/svg?seed=${agent.spriteSeed}&backgroundColor=transparent`;

  return (
    <div className={`
      relative w-32 flex flex-col items-center 
      ${data.isStreaming ? 'filter drop-shadow-[0_0_10px_#43FF4D]' : ''}
    `}>
      {/* Dialogue bubble - positioned northeast of agent */}
      {dialogue && (
        <div className="absolute left-[70%] bottom-full mb-2 z-50 animate-fade-in pointer-events-auto">
          <div className="relative bg-gray-800/95 border border-[#39ff14] rounded-lg p-2.5 shadow-lg w-[200px] animate-bounce-in" style={{ boxShadow: '0 0 15px rgba(57, 255, 20, 0.4)' }}>
            {/* Speech bubble arrow - pointing down-left to agent */}
            <div className="absolute left-0 bottom-0 transform translate-y-full -translate-x-1 w-0 h-0 border-t-[10px] border-r-[10px] border-t-gray-800 border-r-transparent" style={{ filter: 'drop-shadow(-2px 2px 2px rgba(0,0,0,0.3))' }}></div>
            <div className="absolute left-0 bottom-0 transform translate-y-[9px] -translate-x-0.5 w-0 h-0 border-t-[8px] border-r-[8px] border-t-[#39ff14] border-r-transparent"></div>
            
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    agent.status === 'idle' ? 'bg-gray-400' :
                    agent.status === 'negotiating' ? 'bg-yellow-400' :
                    agent.status === 'streaming' ? 'bg-[#39ff14]' :
                    'bg-red-400'
                  }`}></div>
                  <span className="text-[#39ff14] font-bold text-xs truncate">{agent.name}</span>
                </div>
                <p className="text-white text-xs leading-relaxed">{dialogue}</p>
              </div>
              <button
                onClick={onCloseDialogue}
                className="text-gray-400 hover:text-[#39ff14] transition-colors flex-shrink-0 ml-1"
                aria-label="Close dialogue"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
      
      <Handle type="target" position={Position.Top} className="!bg-neon-green !w-3 !h-3 !border-none" />
      
      <div className="relative w-20 h-20 mb-2">
        {/* Status Ring */}
        <div className={`
          absolute inset-0 rounded-full border-2 border-dashed 
          ${data.isStreaming ? 'border-neon-green animate-spin-slow' : 'border-white/20'}
        `}></div>
        
        <img 
          src={spriteUrl} 
          alt={agent.name}
          className="w-full h-full object-contain p-2"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      <div className="bg-black/80 backdrop-blur border border-neon-green/50 px-3 py-1 rounded-md text-center min-w-[120px]">
        <div className="text-[10px] text-neon-green font-mono uppercase font-bold truncate">{agent.name}</div>
        {data.currentAction && (
          <div className="text-[9px] text-white/70 truncate animate-pulse">{data.currentAction}</div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-neon-green !w-3 !h-3 !border-none" />
      
      {/* x402 Stream Badge */}
      {data.isStreaming && (
        <div className="absolute -right-4 top-0 bg-neon-green text-black text-[8px] font-bold px-1 rounded animate-bounce">
          x402
        </div>
      )}
    </div>
  );
});

// Define nodeTypes outside component to prevent re-creation (frozen for stability)
const nodeTypes = Object.freeze({ agentNode: AgentNode });

// Define edgeTypes outside component (even if empty, it prevents warning)
const edgeTypes = Object.freeze({});

// Define proOptions outside component
const proOptions = Object.freeze({ hideAttribution: true });

// Define default edge options outside component
const defaultEdgeOptions = Object.freeze({
  animated: true,
  type: 'default' as const,
  style: Object.freeze({ 
    stroke: '#43FF4D',
    strokeWidth: 3,
    strokeDasharray: '5,5',
  }),
  markerEnd: Object.freeze({
    type: MarkerType.ArrowClosed,
    width: 20,
    height: 20,
    color: '#43FF4D',
  }),
});

interface FlowCanvasProps {
  agents: AgentMetadata[];
  activeAgents: string[];
  streamingEdges: string[]; // list of edge IDs that are streaming
  onNodePositionsChange?: (positions: Record<string, { x: number; y: number }>) => void;
  activeDialogue?: { agentId: string; dialogue: string } | null;
  onCloseDialogue?: () => void;
}

const FlowCanvas: React.FC<FlowCanvasProps> = ({ agents, activeAgents, streamingEdges, onNodePositionsChange, activeDialogue, onCloseDialogue }) => {

  // Convert active agents to Nodes
  const initialNodes: Node[] = useMemo(() => {
    return activeAgents.map((id, index) => {
      const agent = agents.find(a => a.id === id)!;
      return {
        id: agent.id,
        type: 'agentNode',
        position: { x: 100 + (index * 250), y: 100 + (index % 2) * 150 },
        data: { 
          agent,
          isStreaming: false, // Will be updated dynamically via simulation
          currentAction: 'Idling...',
          dialogue: null, // Will hold active dialogue
          onCloseDialogue: () => {}
        },
      };
    });
  }, [activeAgents, agents]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ 
      ...params, 
      ...defaultEdgeOptions,
    }, eds)),
    [setEdges]
  );

  // Effect to update node data when props change (simulation updates)
  useEffect(() => {
    setNodes((nds) => 
      nds.map((node) => {
        // Find if this node is part of a streaming edge
        const isSource = streamingEdges.some(edgeId => edgeId.startsWith(node.id));
        const isTarget = streamingEdges.some(edgeId => edgeId.endsWith(node.id));
        return {
          ...node,
          data: {
            ...node.data,
            isStreaming: isSource || isTarget,
            currentAction: isSource ? 'Streaming x402...' : isTarget ? 'Receiving Service' : 'Idling...',
            // Preserve dialogue and callback
            dialogue: node.data.dialogue,
            onCloseDialogue: node.data.onCloseDialogue
          }
        };
      })
    );

    setEdges(eds => eds.map(e => {
      const isStreaming = streamingEdges.includes(e.id);
      
      // Only update if streaming state changed
      if (e.animated === isStreaming && e.className === (isStreaming ? 'streaming-flow' : '')) {
        return e;
      }
      
      return {
        ...e,
        animated: isStreaming,
        className: isStreaming ? 'streaming-flow' : '',
        type: 'default', // Bezier curves for smooth connections
        style: { 
          stroke: isStreaming ? '#43FF4D' : '#1f2937',
          strokeWidth: isStreaming ? 4 : 2,
          strokeDasharray: isStreaming ? '10,5' : '5,5',
          opacity: isStreaming ? 1 : 0.6,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: isStreaming ? 24 : 18,
          height: isStreaming ? 24 : 18,
          color: isStreaming ? '#43FF4D' : '#1f2937',
        }
      };
    }));
  }, [streamingEdges, activeAgents, setNodes, setEdges]);

  // Re-sync nodes if active agent list changes length significantly (simple approach)
  useEffect(() => {
     if (nodes.length !== activeAgents.length) {
         const newNodes = activeAgents.map((id, index) => {
            const existingNode = nodes.find(n => n.id === id);
            const agent = agents.find(a => a.id === id)!;
            if (existingNode) return existingNode;
            return {
                id: agent.id,
                type: 'agentNode',
                position: { 
                  x: 150 + (index * 200) + (Math.random() * 50 - 25), 
                  y: 150 + ((index % 2) * 200) + (Math.random() * 50 - 25) 
                },
                data: { agent, isStreaming: false, currentAction: 'Booting...' }
            };
         });
         setNodes(newNodes);
     }
  }, [activeAgents, agents, nodes, setNodes]);

  // Report node positions to parent for dialogue placement
  useEffect(() => {
    if (onNodePositionsChange && nodes.length > 0) {
      const positions: Record<string, { x: number; y: number }> = {};
      nodes.forEach(node => {
        positions[node.id] = { x: node.position.x, y: node.position.y };
      });
      onNodePositionsChange(positions);
    }
  }, [nodes, onNodePositionsChange]);

  // Update node data with active dialogue
  useEffect(() => {
    setNodes(nds => 
      nds.map(node => ({
        ...node,
        data: {
          ...node.data,
          dialogue: activeDialogue?.agentId === node.id ? activeDialogue.dialogue : null,
          onCloseDialogue: onCloseDialogue || (() => {})
        }
      }))
    );
  }, [activeDialogue, onCloseDialogue, setNodes]);

  return (
    <div className="w-full h-full bg-[#050505] relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        className="bg-black"
        proOptions={proOptions}
      >
        <Background 
            variant={BackgroundVariant.Dots} 
            gap={24} 
            size={1} 
            color="#1f2937" 
        />
        <Controls className="bg-black border border-white/20 fill-white" />
      </ReactFlow>
      
      {activeAgents.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <h2 className="text-2xl font-mono text-white/30 font-bold">GRID OFFLINE</h2>
            <p className="text-neon-green/50 text-sm font-mono mt-2">Activate agents to begin orchestration</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlowCanvas;