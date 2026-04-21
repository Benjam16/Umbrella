// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IUmbrellaAgentToken } from "../interfaces/IUmbrellaAgentToken.sol";

/**
 * @notice Lightweight placeholder while v4-periphery wiring is finalized.
 * It preserves the fee-band math and on-chain configuration surface that the
 * rest of Umbrella reads, but does not inherit Uniswap hook base classes yet.
 */
contract UmbrellaPerformanceHook {
    uint24 internal constant FEE_ELITE = 500;
    uint24 internal constant FEE_HEALTHY = 1_500;
    uint24 internal constant FEE_NEUTRAL = 3_000;
    uint24 internal constant FEE_PUNITIVE = 6_000;

    uint32 internal constant BAND_ELITE = 9_500;
    uint32 internal constant BAND_HEALTHY = 8_000;
    uint32 internal constant BAND_NEUTRAL = 5_000;

    address public immutable owner;
    mapping(bytes32 poolId => address agentToken) public tokenForPool;

    event PoolRegistered(bytes32 indexed poolId, address indexed agentToken);
    event DynamicFeeApplied(bytes32 indexed poolId, uint32 successRate, uint24 fee);

    error NotOwner();
    error PoolAlreadyRegistered(bytes32 poolId);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _owner) {
        owner = _owner;
    }

    function registerPool(bytes32 poolId, address agentToken) external onlyOwner {
        if (tokenForPool[poolId] != address(0)) revert PoolAlreadyRegistered(poolId);
        tokenForPool[poolId] = agentToken;
        emit PoolRegistered(poolId, agentToken);
    }

    function quoteDynamicFee(bytes32 poolId) external returns (uint24) {
        address token = tokenForPool[poolId];
        uint24 fee = FEE_NEUTRAL;
        if (token != address(0)) {
            uint32 rate = IUmbrellaAgentToken(token).successRate();
            fee = _feeForRate(rate);
            emit DynamicFeeApplied(poolId, rate, fee);
        }
        return fee;
    }

    function _feeForRate(uint32 rate) internal pure returns (uint24) {
        if (rate >= BAND_ELITE) return FEE_ELITE;
        if (rate >= BAND_HEALTHY) return FEE_HEALTHY;
        if (rate >= BAND_NEUTRAL) return FEE_NEUTRAL;
        return FEE_PUNITIVE;
    }
}
