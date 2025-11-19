import { parseUnits } from 'viem';
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useTransactionReceipt } from 'wagmi';
import EIP8004AgentABI from '../contracts/abis/EIP8004Agent.json';

const EIP8004_ADDRESS = '0x650665fdf08EeE72e84953D5a99AbC8196C56E77' as const;

export interface AgentMetadata {
  name: string;
  role: string;
  description: string;
  capabilities: string[];
}

export const useMintAgent = () => {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({
    hash,
  });

  const mintAgent = async (metadata: AgentMetadata) => {
    const metadataURI = `ipfs://agent/${metadata.name.toLowerCase()}`;
    const apiURI = `https://api.spriteops.io/agent/${metadata.name.toLowerCase()}`;
    const fee = parseUnits('0.1', 6); // 0.1 USDC per use
    const feeModel = 0; // PerUse
    
    return writeContract({
      address: EIP8004_ADDRESS,
      abi: EIP8004AgentABI as any,
      functionName: 'mintAgent',
      args: [
        metadata.name,
        metadata.role,
        metadataURI,
        apiURI,
        fee,
        feeModel,
        metadata.capabilities
      ],
    });
  };

  return {
    mintAgent,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    receipt,
    error,
  };
};

export const useAgentData = (agentId?: bigint) => {
  const { data, isLoading, error } = useReadContract({
    address: EIP8004_ADDRESS as `0x${string}`,
    abi: EIP8004AgentABI,
    functionName: 'getAgentData',
    args: agentId ? [agentId] : undefined,
    query: {
      enabled: !!agentId,
    },
  });

  return { agentData: data, isLoading, error };
};

export const useIsAgentActive = (agentId?: bigint) => {
  const { data, isLoading, error } = useReadContract({
    address: EIP8004_ADDRESS as `0x${string}`,
    abi: EIP8004AgentABI,
    functionName: 'isAgentActive',
    args: agentId ? [agentId] : undefined,
    query: {
      enabled: !!agentId,
    },
  });

  return { isActive: data as boolean, isLoading, error };
};

export const useTotalAgents = () => {
  const { data, isLoading, error } = useReadContract({
    address: EIP8004_ADDRESS as `0x${string}`,
    abi: EIP8004AgentABI,
    functionName: 'totalAgents',
  });

  return { totalAgents: data as bigint, isLoading, error };
};

export const useDeactivateAgent = () => {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const deactivateAgent = async (agentId: bigint) => {
    return writeContract({
      address: EIP8004_ADDRESS,
      abi: EIP8004AgentABI as any,
      functionName: 'deactivateAgent' as const,
      args: [agentId] as const,
    });
  };

  return {
    deactivateAgent,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
};
