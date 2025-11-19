// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title IEIP8004
 * @dev Interface for EIP-8004 Tokenized AI Agent standard
 * Each agent is an NFT with metadata, API endpoint, fee model, and capabilities
 */
interface IEIP8004 is IERC721 {
    enum AgentStatus {
        Active,
        Paused,
        Deleted
    }

    enum FeeModel {
        PerUse,
        PerSecond,
        Subscription
    }

    struct AgentData {
        string name;
        string role;
        string metadataURI;
        string apiURI;
        uint256 fee;
        FeeModel feeModel;
        AgentStatus status;
        uint64 trustScore;
        uint64 createdAt;
        uint64 lastActiveAt;
        string[] capabilities;
    }

    // Events
    event AgentCreated(
        uint256 indexed agentId,
        address indexed owner,
        string name,
        string role,
        uint256 fee
    );
    
    event AgentUpdated(
        uint256 indexed agentId,
        string metadataURI
    );
    
    event AgentAPISet(
        uint256 indexed agentId,
        string apiURI
    );
    
    event AgentFeeSet(
        uint256 indexed agentId,
        uint256 fee,
        FeeModel feeModel
    );
    
    event AgentPaused(uint256 indexed agentId);
    event AgentResumed(uint256 indexed agentId);
    event AgentDeleted(uint256 indexed agentId);
    event TrustScoreUpdated(uint256 indexed agentId, uint64 newScore);

    // Core functions
    function mintAgent(
        string memory name,
        string memory role,
        string memory metadataURI,
        string memory apiURI,
        uint256 fee,
        FeeModel feeModel,
        string[] memory capabilities
    ) external returns (uint256);

    function updateAgentMetadata(uint256 agentId, string memory metadataURI) external;
    function updateAgentAPI(uint256 agentId, string memory apiURI) external;
    function setAgentFee(uint256 agentId, uint256 fee, FeeModel feeModel) external;
    function pauseAgent(uint256 agentId) external;
    function resumeAgent(uint256 agentId) external;
    function deleteAgent(uint256 agentId) external;
    function updateTrustScore(uint256 agentId, uint64 newScore) external;

    // View functions
    function getAgentData(uint256 agentId) external view returns (AgentData memory);
    function isAgentActive(uint256 agentId) external view returns (bool);
    function getAgentFee(uint256 agentId) external view returns (uint256, FeeModel);
    function getAgentOwner(uint256 agentId) external view returns (address);
    function totalAgents() external view returns (uint256);
}
