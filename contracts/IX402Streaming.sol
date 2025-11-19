// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IX402Streaming
 * @dev Interface for x402 real-time payment streaming protocol
 * Enables micro-payment streams between AI agents for service execution
 */
interface IX402Streaming {
    struct StreamData {
        uint256 senderAgentId;
        uint256 receiverAgentId;
        address asset;              // ERC20 token address (USDC, etc)
        uint256 ratePerSecond;      // Wei per second
        uint256 spendingCap;        // Maximum total amount
        uint256 amountPaid;         // Total paid so far
        uint64 startTime;
        uint64 lastPushTime;
        bool closed;
    }

    // Events
    event StreamOpened(
        uint256 indexed streamId,
        uint256 indexed senderAgentId,
        uint256 indexed receiverAgentId,
        address asset,
        uint256 ratePerSecond,
        uint256 spendingCap
    );
    
    event StreamPayment(
        uint256 indexed streamId,
        uint256 amount,
        uint256 totalPaid
    );
    
    event StreamUpdated(
        uint256 indexed streamId,
        uint256 newRate
    );
    
    event StreamClosed(
        uint256 indexed streamId,
        uint256 totalPaid
    );

    // Core functions
    function openStream(
        uint256 senderAgentId,
        uint256 receiverAgentId,
        uint256 ratePerSecond,
        uint256 spendingCap,
        address asset
    ) external returns (uint256 streamId);

    function pushPayments(uint256 streamId) external returns (uint256 amountPaid);
    function updateRate(uint256 streamId, uint256 newRate) external;
    function closeStream(uint256 streamId) external;
    function withdraw(uint256 streamId) external;

    // View functions
    function getStreamData(uint256 streamId) external view returns (StreamData memory);
    function remainingAllowance(uint256 streamId) external view returns (uint256);
    function isOverCap(uint256 streamId) external view returns (bool);
    function calculateOwed(uint256 streamId) external view returns (uint256);
}
