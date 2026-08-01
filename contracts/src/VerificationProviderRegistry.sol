// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

/// @notice Registry of verification providers trusted to back student credentials.
/// Kept separate from StudentCredentialRegistry so new providers can be trusted
/// (or existing ones revoked) without redeploying the credential contract.
contract VerificationProviderRegistry is Ownable {
    mapping(string => bool) private _trustedProviders;
    mapping(string => string) private _providerNames;

    event ProviderAdded(string providerId, string providerName);
    event ProviderRemoved(string providerId);

    constructor() Ownable(msg.sender) {}

    function addProvider(string calldata providerId, string calldata name) external onlyOwner {
        _trustedProviders[providerId] = true;
        _providerNames[providerId] = name;
        emit ProviderAdded(providerId, name);
    }

    function removeProvider(string calldata providerId) external onlyOwner {
        delete _trustedProviders[providerId];
        delete _providerNames[providerId];
        emit ProviderRemoved(providerId);
    }

    function isTrustedProvider(string calldata providerId) external view returns (bool) {
        return _trustedProviders[providerId];
    }

    function providerName(string calldata providerId) external view returns (string memory) {
        return _providerNames[providerId];
    }
}
