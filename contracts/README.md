# SpriteOps Smart Contracts

## Architecture Overview

The SpriteOps system consists of two core smart contracts that work together to enable tokenized AI agents with real-time payment streaming.

### 1. EIP-8004 Tokenized Agent Contract

**Purpose:** Each AI agent is minted as an ERC721 NFT with full metadata, capabilities, and service configuration.

**Key Features:**
- ERC721-compliant tokenized agents
- Full CRUD operations for agent management
- Dynamic fee models (per-use, per-second, subscription)
- Trust score tracking
- Pause/resume functionality
- Role-based access control

**Gas Optimization:**
- Struct packing (uint64 timestamps)
- Unchecked math where safe
- Immutable variables where possible

### 2. x402 Streaming Payment Contract

**Purpose:** Real-time micro-payment streaming for A2A service execution with spending caps.

**Key Features:**
- Open/close payment streams
- Real-time payment accumulation
- Automatic cap enforcement
- Withdrawable balance tracking
- Rate updates mid-stream
- SafeERC20 for all transfers

**Gas Optimization:**
- Unchecked arithmetic for timestamps and increments
- Storage-efficient struct packing
- Minimal state updates

## Contract Integration

### Flow:
1. User activates agent → Frontend calls `mintAgent()`
2. Agent A needs service from Agent B → A2A protocol initiates
3. Contract validates both agents active via EIP-8004 registry
4. `openStream()` called with spending cap
5. Payments accumulate at specified rate per second
6. Auto-close when cap reached
7. Receiver withdraws accumulated funds

### Key Integration Points:

```solidity
// X402Streaming references EIP8004Agent registry
IEIP8004 public immutable agentRegistry;

// Validates agents before stream creation
require(agentRegistry.isAgentActive(senderAgentId), "Sender not active");
require(agentRegistry.isAgentActive(receiverAgentId), "Receiver not active");
```

## Deployment

### Prerequisites:
- OpenZeppelin Contracts v5.0+
- Solidity ^0.8.20
- Hardhat or Foundry

### Deploy Sequence:
1. Deploy EIP8004Agent contract
2. Deploy X402Streaming with agent registry address
3. Grant ADMIN_ROLE to authorized addresses
4. Frontend connects to both contracts

## Frontend Integration Examples

### Mint Agent (TypeScript)

```typescript
import { ethers } from 'ethers';

async function mintAgent(
  contract: ethers.Contract,
  name: string,
  role: string,
  metadataURI: string,
  apiURI: string,
  feeInUSDC: string,
  capabilities: string[]
) {
  // Convert USDC to wei (6 decimals)
  const feeWei = ethers.parseUnits(feeInUSDC, 6);
  
  const tx = await contract.mintAgent(
    name,
    role,
    metadataURI,
    apiURI,
    feeWei,
    1, // FeeModel.PerSecond
    capabilities
  );
  
  const receipt = await tx.wait();
  const event = receipt.logs.find((log: any) => 
    log.eventName === 'AgentCreated'
  );
  
  return event.args.agentId; // Returns new agent token ID
}
```

### Open Payment Stream (TypeScript)

```typescript
async function openPaymentStream(
  x402Contract: ethers.Contract,
  usdcContract: ethers.Contract,
  senderAgentId: bigint,
  receiverAgentId: bigint,
  ratePerSecondUSDC: string, // e.g., "0.001"
  budgetCapUSDC: string // e.g., "10.0"
) {
  const rateWei = ethers.parseUnits(ratePerSecondUSDC, 6);
  const capWei = ethers.parseUnits(budgetCapUSDC, 6);
  
  // Approve x402 contract to spend USDC
  const approveTx = await usdcContract.approve(
    await x402Contract.getAddress(),
    capWei
  );
  await approveTx.wait();
  
  // Open stream
  const tx = await x402Contract.openStream(
    senderAgentId,
    receiverAgentId,
    rateWei,
    capWei,
    await usdcContract.getAddress()
  );
  
  const receipt = await tx.wait();
  const event = receipt.logs.find((log: any) => 
    log.eventName === 'StreamOpened'
  );
  
  return event.args.streamId;
}
```

### Push Payments (Keep Stream Flowing)

```typescript
async function pushStreamPayments(
  contract: ethers.Contract,
  streamId: bigint
) {
  const tx = await contract.pushPayments(streamId);
  const receipt = await tx.wait();
  
  const event = receipt.logs.find((log: any) => 
    log.eventName === 'StreamPayment'
  );
  
  return {
    amountPaid: event.args.amount,
    totalPaid: event.args.totalPaid
  };
}
```

### Subscribe to Events (Real-time UI Updates)

```typescript
// Listen for stream updates
function subscribeToStreamEvents(
  contract: ethers.Contract,
  streamId: bigint,
  onPayment: (amount: bigint, total: bigint) => void,
  onClosed: (totalPaid: bigint) => void
) {
  const paymentFilter = contract.filters.StreamPayment(streamId);
  contract.on(paymentFilter, (id, amount, total) => {
    onPayment(amount, total);
  });
  
  const closedFilter = contract.filters.StreamClosed(streamId);
  contract.on(closedFilter, (id, totalPaid) => {
    onClosed(totalPaid);
  });
}
```

### Get Agent Data (Display in UI)

```typescript
async function getAgentDetails(
  contract: ethers.Contract,
  agentId: bigint
) {
  const data = await contract.getAgentData(agentId);
  
  return {
    name: data.name,
    role: data.role,
    metadataURI: data.metadataURI,
    apiURI: data.apiURI,
    fee: ethers.formatUnits(data.fee, 6), // USDC
    feeModel: ['PerUse', 'PerSecond', 'Subscription'][data.feeModel],
    status: ['Active', 'Paused', 'Deleted'][data.status],
    trustScore: data.trustScore.toString(),
    capabilities: data.capabilities
  };
}
```

### Check Stream Status (Real-time Progress)

```typescript
async function getStreamStatus(
  contract: ethers.Contract,
  streamId: bigint
) {
  const [data, remaining, isOver] = await Promise.all([
    contract.getStreamData(streamId),
    contract.remainingAllowance(streamId),
    contract.isOverCap(streamId)
  ]);
  
  const progress = Number(data.amountPaid) / Number(data.spendingCap) * 100;
  
  return {
    senderAgentId: data.senderAgentId,
    receiverAgentId: data.receiverAgentId,
    ratePerSecond: ethers.formatUnits(data.ratePerSecond, 6),
    budgetCap: ethers.formatUnits(data.spendingCap, 6),
    amountPaid: ethers.formatUnits(data.amountPaid, 6),
    remaining: ethers.formatUnits(remaining, 6),
    progress: progress,
    isOverCap: isOver,
    closed: data.closed,
    startTime: new Date(Number(data.startTime) * 1000)
  };
}
```

## React Integration Example

```typescript
import { useEffect, useState } from 'react';
import { useContract, useContractEvent } from 'wagmi';

function AgentStreamMonitor({ streamId }: { streamId: bigint }) {
  const [progress, setProgress] = useState(0);
  const [totalPaid, setTotalPaid] = useState('0');
  
  const { data: contract } = useContract({
    address: X402_STREAMING_ADDRESS,
    abi: X402_ABI
  });
  
  // Listen to payment events
  useContractEvent({
    address: X402_STREAMING_ADDRESS,
    abi: X402_ABI,
    eventName: 'StreamPayment',
    listener(logs) {
      const log = logs[0];
      if (log.args.streamId === streamId) {
        setTotalPaid(ethers.formatUnits(log.args.totalPaid, 6));
        // Update progress
        updateProgress();
      }
    }
  });
  
  // Update progress periodically
  useEffect(() => {
    const interval = setInterval(updateProgress, 1000);
    return () => clearInterval(interval);
  }, []);
  
  async function updateProgress() {
    if (!contract) return;
    const status = await getStreamStatus(contract, streamId);
    setProgress(status.progress);
  }
  
  return (
    <div className="stream-monitor">
      <div className="progress-bar" style={{ width: `${progress}%` }} />
      <p>Paid: {totalPaid} USDC</p>
    </div>
  );
}
```

## Security Considerations

1. **Reentrancy Protection:** All state-changing functions use ReentrancyGuard
2. **SafeERC20:** All token transfers use SafeERC20 library
3. **Access Control:** Role-based permissions for critical operations
4. **Integer Overflow:** Uses Solidity 0.8.20+ with built-in checks
5. **Unchecked Math:** Only used where overflow is impossible (timestamps, capped amounts)

## Gas Estimates

- `mintAgent()`: ~150k gas
- `openStream()`: ~120k gas
- `pushPayments()`: ~80k gas
- `closeStream()`: ~90k gas
- `withdraw()`: ~60k gas

## Testing

See `test/` directory for comprehensive unit tests covering:
- Agent lifecycle management
- Stream opening/closing
- Payment accumulation
- Cap enforcement
- Edge cases and failure modes
