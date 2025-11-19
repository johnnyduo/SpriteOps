// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IX402Streaming.sol";
import "./IEIP8004.sol";

/**
 * @title X402Streaming
 * @dev Implementation of x402 payment streaming protocol for A2A service execution
 * Supports real-time micro-payments with spending caps and auto-close on budget exhaustion
 */
contract X402Streaming is IX402Streaming, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IEIP8004 public immutable agentRegistry;
    
    uint256 private _nextStreamId;
    mapping(uint256 => StreamData) private _streams;
    mapping(uint256 => uint256) private _withdrawableBalance; // streamId => amount
    
    modifier streamExists(uint256 streamId) {
        require(streamId > 0 && streamId < _nextStreamId, "Stream does not exist");
        _;
    }
    
    modifier streamOpen(uint256 streamId) {
        require(!_streams[streamId].closed, "Stream closed");
        _;
    }
    
    modifier onlyStreamParty(uint256 streamId) {
        StreamData memory stream = _streams[streamId];
        address senderOwner = agentRegistry.getAgentOwner(stream.senderAgentId);
        address receiverOwner = agentRegistry.getAgentOwner(stream.receiverAgentId);
        require(
            msg.sender == senderOwner || msg.sender == receiverOwner,
            "Not authorized"
        );
        _;
    }

    constructor(address _agentRegistry) {
        require(_agentRegistry != address(0), "Invalid registry");
        agentRegistry = IEIP8004(_agentRegistry);
        _nextStreamId = 1;
    }

    /**
     * @dev Open a new payment stream between two agents
     * @param senderAgentId EIP-8004 token ID of paying agent
     * @param receiverAgentId EIP-8004 token ID of receiving agent
     * @param ratePerSecond Payment rate in wei per second
     * @param spendingCap Maximum total amount to spend
     * @param asset ERC20 token address (USDC, HBAR, etc)
     * @return streamId The newly created stream ID
     */
    function openStream(
        uint256 senderAgentId,
        uint256 receiverAgentId,
        uint256 ratePerSecond,
        uint256 spendingCap,
        address asset
    ) external nonReentrant returns (uint256) {
        // Validate agents exist and are active
        require(agentRegistry.isAgentActive(senderAgentId), "Sender agent not active");
        require(agentRegistry.isAgentActive(receiverAgentId), "Receiver agent not active");
        require(senderAgentId != receiverAgentId, "Cannot stream to self");
        
        // Validate sender is owner
        require(
            agentRegistry.getAgentOwner(senderAgentId) == msg.sender,
            "Not sender agent owner"
        );
        
        // Validate parameters
        require(ratePerSecond > 0, "Rate must be positive");
        require(spendingCap > 0, "Cap must be positive");
        require(asset != address(0), "Invalid asset");
        
        // Transfer spending cap to contract as escrow
        IERC20(asset).safeTransferFrom(msg.sender, address(this), spendingCap);
        
        uint256 streamId = _nextStreamId++;
        
        unchecked {
            _streams[streamId] = StreamData({
                senderAgentId: senderAgentId,
                receiverAgentId: receiverAgentId,
                asset: asset,
                ratePerSecond: ratePerSecond,
                spendingCap: spendingCap,
                amountPaid: 0,
                startTime: uint64(block.timestamp),
                lastPushTime: uint64(block.timestamp),
                closed: false
            });
        }
        
        emit StreamOpened(
            streamId,
            senderAgentId,
            receiverAgentId,
            asset,
            ratePerSecond,
            spendingCap
        );
        
        return streamId;
    }

    /**
     * @dev Push accumulated payments from stream to receiver
     * Can be called by anyone to keep stream flowing
     * @param streamId The stream to process
     * @return amountPaid The amount transferred in this push
     */
    function pushPayments(uint256 streamId) 
        external 
        nonReentrant 
        streamExists(streamId) 
        streamOpen(streamId) 
        returns (uint256) 
    {
        StreamData storage stream = _streams[streamId];
        
        uint256 owed = _calculateOwed(stream);
        
        if (owed == 0) {
            return 0;
        }
        
        // Update stream state
        unchecked {
            stream.amountPaid += owed;
            stream.lastPushTime = uint64(block.timestamp);
        }
        
        // Add to withdrawable balance for receiver
        unchecked {
            _withdrawableBalance[streamId] += owed;
        }
        
        emit StreamPayment(streamId, owed, stream.amountPaid);
        
        // Auto-close if cap reached
        if (stream.amountPaid >= stream.spendingCap) {
            _closeStream(streamId);
        }
        
        return owed;
    }

    /**
     * @dev Update stream rate (only sender can adjust)
     * @param streamId The stream to update
     * @param newRate New rate per second in wei
     */
    function updateRate(uint256 streamId, uint256 newRate) 
        external 
        streamExists(streamId) 
        streamOpen(streamId) 
    {
        StreamData storage stream = _streams[streamId];
        require(
            agentRegistry.getAgentOwner(stream.senderAgentId) == msg.sender,
            "Not sender owner"
        );
        require(newRate > 0, "Rate must be positive");
        
        // Push any pending payments first
        this.pushPayments(streamId);
        
        stream.ratePerSecond = newRate;
        emit StreamUpdated(streamId, newRate);
    }

    /**
     * @dev Close stream and return remaining funds to sender
     * @param streamId The stream to close
     */
    function closeStream(uint256 streamId) 
        external 
        nonReentrant 
        streamExists(streamId) 
        streamOpen(streamId) 
        onlyStreamParty(streamId) 
    {
        // Push final payments
        this.pushPayments(streamId);
        
        _closeStream(streamId);
    }

    /**
     * @dev Withdraw accumulated payments (receiver only)
     * @param streamId The stream to withdraw from
     */
    function withdraw(uint256 streamId) 
        external 
        nonReentrant 
        streamExists(streamId) 
    {
        StreamData memory stream = _streams[streamId];
        require(
            agentRegistry.getAgentOwner(stream.receiverAgentId) == msg.sender,
            "Not receiver owner"
        );
        
        uint256 amount = _withdrawableBalance[streamId];
        require(amount > 0, "Nothing to withdraw");
        
        _withdrawableBalance[streamId] = 0;
        
        IERC20(stream.asset).safeTransfer(msg.sender, amount);
    }

    // View functions
    function getStreamData(uint256 streamId) 
        external 
        view 
        streamExists(streamId) 
        returns (StreamData memory) 
    {
        return _streams[streamId];
    }

    function remainingAllowance(uint256 streamId) 
        external 
        view 
        streamExists(streamId) 
        returns (uint256) 
    {
        StreamData memory stream = _streams[streamId];
        if (stream.closed) return 0;
        
        uint256 owed = _calculateOwed(stream);
        unchecked {
            return stream.spendingCap - stream.amountPaid - owed;
        }
    }

    function isOverCap(uint256 streamId) 
        external 
        view 
        streamExists(streamId) 
        returns (bool) 
    {
        StreamData memory stream = _streams[streamId];
        uint256 owed = _calculateOwed(stream);
        unchecked {
            return (stream.amountPaid + owed) >= stream.spendingCap;
        }
    }

    function calculateOwed(uint256 streamId) 
        external 
        view 
        streamExists(streamId) 
        returns (uint256) 
    {
        return _calculateOwed(_streams[streamId]);
    }

    // Internal functions
    function _calculateOwed(StreamData memory stream) internal view returns (uint256) {
        if (stream.closed) return 0;
        
        unchecked {
            uint256 elapsed = block.timestamp - stream.lastPushTime;
            uint256 owed = elapsed * stream.ratePerSecond;
            
            // Cap at remaining budget
            uint256 remaining = stream.spendingCap - stream.amountPaid;
            return owed > remaining ? remaining : owed;
        }
    }

    function _closeStream(uint256 streamId) internal {
        StreamData storage stream = _streams[streamId];
        stream.closed = true;
        
        // Return unused funds to sender
        unchecked {
            uint256 unused = stream.spendingCap - stream.amountPaid;
            if (unused > 0) {
                address senderOwner = agentRegistry.getAgentOwner(stream.senderAgentId);
                IERC20(stream.asset).safeTransfer(senderOwner, unused);
            }
        }
        
        emit StreamClosed(streamId, stream.amountPaid);
    }
}
