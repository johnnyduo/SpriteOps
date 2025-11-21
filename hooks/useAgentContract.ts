import { parseUnits } from 'viem';
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useTransactionReceipt, useAccount, useConfig } from 'wagmi';
import EIP8004AgentABI from '../contracts/abis/EIP8004Agent.json';

const EIP8004_ADDRESS = '0x650665fdf08EeE72e84953D5a99AbC8196C56E77' as const;

export interface AgentMetadata {
  name: string;
  role: string;
  description: string;
  capabilities: string[];
}

export const useMintAgent = () => {
  const { address } = useAccount();
  const config = useConfig();
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({
    hash,
  });

  const mintAgent = async (metadata: AgentMetadata) => {
    if (!address) throw new Error('Wallet not connected');
    
    const metadataURI = `ipfs://agent/${metadata.name.toLowerCase()}`;
    const apiURI = `https://api.aslan-agents.io/agent/${metadata.name.toLowerCase()}`;
    const fee = parseUnits('0.1', 6); // 0.1 USDC per use
    const feeModel = 0; // PerUse
    
    return writeContractAsync({
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
      account: address,
      chain: config.chains[0],
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
  const { address } = useAccount();
  const config = useConfig();
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const deactivateAgent = async (agentId: bigint) => {
    if (!address) throw new Error('Wallet not connected');
    
    return writeContractAsync({
      address: EIP8004_ADDRESS,
      abi: EIP8004AgentABI as any,
      functionName: 'deactivateAgent' as const,
      args: [agentId] as const,
      account: address,
      chain: config.chains[0],
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
