// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IEIP8004.sol";

/**
 * @title EIP8004Agent
 * @dev Implementation of EIP-8004 Tokenized AI Agent standard
 * Each AI agent is minted as an ERC721 NFT with full metadata and service capabilities
 */
contract EIP8004Agent is ERC721, AccessControl, ReentrancyGuard, IEIP8004 {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    uint256 private _nextAgentId;
    mapping(uint256 => AgentData) private _agents;
    
    modifier onlyAgentOwner(uint256 agentId) {
        require(ownerOf(agentId) == msg.sender, "Not agent owner");
        _;
    }
    
    modifier agentExists(uint256 agentId) {
        require(_ownerOf(agentId) != address(0), "Agent does not exist");
        _;
    }
    
    constructor() ERC721("Aslan Agent", "AGENT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _nextAgentId = 1; // Start from ID 1
    }

    /**
     * @dev Mint a new AI agent as ERC721 token
     * @param name Agent display name
     * @param role Agent role (e.g., "COMMANDER", "NAVIGATOR")
     * @param metadataURI IPFS or HTTP URI for metadata JSON
     * @param apiURI Agent's A2A API endpoint
     * @param fee Fee amount for service usage
     * @param feeModel Fee calculation model (per use, per second, subscription)
     * @param capabilities Array of agent capabilities
     * @return agentId The newly minted agent token ID
     */
    function mintAgent(
        string memory name,
        string memory role,
        string memory metadataURI,
        string memory apiURI,
        uint256 fee,
        FeeModel feeModel,
        string[] memory capabilities
    ) external nonReentrant returns (uint256) {
        uint256 agentId = _nextAgentId++;
        
        _safeMint(msg.sender, agentId);
        
        _agents[agentId] = AgentData({
            name: name,
            role: role,
            metadataURI: metadataURI,
            apiURI: apiURI,
            fee: fee,
            feeModel: feeModel,
            status: AgentStatus.Active,
            trustScore: 100, // Start with perfect score
            createdAt: uint64(block.timestamp),
            lastActiveAt: uint64(block.timestamp),
            capabilities: capabilities
        });
        
        emit AgentCreated(agentId, msg.sender, name, role, fee);
        
        return agentId;
    }

    /**
     * @dev Update agent metadata URI
     */
    function updateAgentMetadata(
        uint256 agentId, 
        string memory metadataURI
    ) external agentExists(agentId) onlyAgentOwner(agentId) {
        require(_agents[agentId].status != AgentStatus.Deleted, "Agent deleted");
        _agents[agentId].metadataURI = metadataURI;
        emit AgentUpdated(agentId, metadataURI);
    }

    /**
     * @dev Update agent API endpoint
     */
    function updateAgentAPI(
        uint256 agentId, 
        string memory apiURI
    ) external agentExists(agentId) onlyAgentOwner(agentId) {
        require(_agents[agentId].status != AgentStatus.Deleted, "Agent deleted");
        _agents[agentId].apiURI = apiURI;
        _agents[agentId].lastActiveAt = uint64(block.timestamp);
        emit AgentAPISet(agentId, apiURI);
    }

    /**
     * @dev Set or update agent service fee
     */
    function setAgentFee(
        uint256 agentId, 
        uint256 fee, 
        FeeModel feeModel
    ) external agentExists(agentId) onlyAgentOwner(agentId) {
        require(_agents[agentId].status != AgentStatus.Deleted, "Agent deleted");
        _agents[agentId].fee = fee;
        _agents[agentId].feeModel = feeModel;
        emit AgentFeeSet(agentId, fee, feeModel);
    }

    /**
     * @dev Pause agent (emergency or maintenance)
     */
    function pauseAgent(uint256 agentId) external agentExists(agentId) {
        require(
            ownerOf(agentId) == msg.sender || hasRole(ADMIN_ROLE, msg.sender),
            "Not authorized"
        );
        require(_agents[agentId].status == AgentStatus.Active, "Agent not active");
        _agents[agentId].status = AgentStatus.Paused;
        emit AgentPaused(agentId);
    }

    /**
     * @dev Resume paused agent
     */
    function resumeAgent(uint256 agentId) external agentExists(agentId) onlyAgentOwner(agentId) {
        require(_agents[agentId].status == AgentStatus.Paused, "Agent not paused");
        _agents[agentId].status = AgentStatus.Active;
        _agents[agentId].lastActiveAt = uint64(block.timestamp);
        emit AgentResumed(agentId);
    }

    /**
     * @dev Delete (burn) agent token
     */
    function deleteAgent(uint256 agentId) external agentExists(agentId) onlyAgentOwner(agentId) {
        _agents[agentId].status = AgentStatus.Deleted;
        _burn(agentId);
        emit AgentDeleted(agentId);
    }

    /**
     * @dev Update trust score (only admin can adjust)
     */
    function updateTrustScore(
        uint256 agentId, 
        uint64 newScore
    ) external agentExists(agentId) onlyRole(ADMIN_ROLE) {
        require(newScore <= 100, "Score must be 0-100");
        _agents[agentId].trustScore = newScore;
        emit TrustScoreUpdated(agentId, newScore);
    }

    // View functions
    function getAgentData(uint256 agentId) external view agentExists(agentId) returns (AgentData memory) {
        return _agents[agentId];
    }

    function isAgentActive(uint256 agentId) external view returns (bool) {
        return _ownerOf(agentId) != address(0) && _agents[agentId].status == AgentStatus.Active;
    }

    function getAgentFee(uint256 agentId) external view agentExists(agentId) returns (uint256, FeeModel) {
        return (_agents[agentId].fee, _agents[agentId].feeModel);
    }

    function getAgentOwner(uint256 agentId) external view agentExists(agentId) returns (address) {
        return ownerOf(agentId);
    }

    function totalAgents() external view returns (uint256) {
        return _nextAgentId - 1;
    }

    // Override supportsInterface for AccessControl + ERC721
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl, IERC165)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
