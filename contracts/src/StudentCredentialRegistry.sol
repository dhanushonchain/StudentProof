// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {VerificationProviderRegistry} from "./VerificationProviderRegistry.sol";

/// @notice Soulbound (non-transferable) student credential, minted once a
/// verification succeeds through a trusted provider. Stores no personal data
/// on-chain — only which provider verified the holder and when.
///
/// mintCredential is gated by `onlyMinter`, not left open to any caller: an
/// unrestricted mint would let anyone issue themselves a "verified student"
/// credential for a trusted providerId without ever actually verifying
/// anything, since this contract has no way to itself check that an
/// off-chain proof happened. The backend's dedicated minter wallet is the
/// only account trusted to assert "this address genuinely verified".
contract StudentCredentialRegistry is ERC721, Ownable {
    struct CredentialData {
        string providerId;
        uint256 issuedAt;
    }

    VerificationProviderRegistry public immutable providerRegistry;
    address public authorizedMinter;

    uint256 private _nextTokenId = 1;
    mapping(address => uint256) private _tokenIdByHolder;
    mapping(uint256 => CredentialData) private _credentialData;
    mapping(uint256 => bool) private _revoked;

    event CredentialMinted(address indexed student, uint256 indexed tokenId, string providerId, uint256 issuedAt);
    event CredentialRevoked(address indexed student, uint256 indexed tokenId);
    event MinterUpdated(address indexed previousMinter, address indexed newMinter);

    error NotAuthorizedMinter();
    error ProviderNotTrusted(string providerId);
    error CredentialAlreadyIssued(address student);
    error CredentialTransfersDisabled();
    error NoCredential(address student);

    modifier onlyMinter() {
        if (msg.sender != authorizedMinter) revert NotAuthorizedMinter();
        _;
    }

    constructor(address registryAddress, address initialMinter) ERC721("StudentProof Credential", "SPROOF") Ownable(msg.sender) {
        providerRegistry = VerificationProviderRegistry(registryAddress);
        authorizedMinter = initialMinter;
        emit MinterUpdated(address(0), initialMinter);
    }

    /// @notice Rotate which wallet is allowed to mint, without redeploying.
    function setAuthorizedMinter(address newMinter) external onlyOwner {
        emit MinterUpdated(authorizedMinter, newMinter);
        authorizedMinter = newMinter;
    }

    function mintCredential(address student, string calldata providerId) external onlyMinter returns (uint256) {
        if (!providerRegistry.isTrustedProvider(providerId)) revert ProviderNotTrusted(providerId);
        if (balanceOf(student) != 0) revert CredentialAlreadyIssued(student);

        uint256 tokenId = _nextTokenId++;
        _credentialData[tokenId] = CredentialData({providerId: providerId, issuedAt: block.timestamp});
        _tokenIdByHolder[student] = tokenId;

        _safeMint(student, tokenId);

        emit CredentialMinted(student, tokenId, providerId, block.timestamp);
        return tokenId;
    }

    /// @notice Soft-revoke: the token stays on-chain (preserving the audit
    /// trail — it existed, then was revoked) but hasValidCredential flips to
    /// false. Not wired up to any caller yet, per spec — exists for later.
    function revokeCredential(address student) external onlyOwner {
        uint256 tokenId = _tokenIdByHolder[student];
        if (tokenId == 0 || _ownerOf(tokenId) == address(0)) revert NoCredential(student);

        _revoked[tokenId] = true;
        emit CredentialRevoked(student, tokenId);
    }

    function hasValidCredential(address wallet) external view returns (bool) {
        uint256 tokenId = _tokenIdByHolder[wallet];
        if (tokenId == 0 || _ownerOf(tokenId) == address(0)) return false;
        return !_revoked[tokenId];
    }

    function credentialOf(address wallet) external view returns (CredentialData memory) {
        uint256 tokenId = _tokenIdByHolder[wallet];
        if (tokenId == 0) revert NoCredential(wallet);
        return _credentialData[tokenId];
    }

    // --- Soulbound: block every transfer path, mint/burn still allowed ---
    // Overriding _update (rather than just transferFrom/safeTransferFrom) is
    // the OZ v5-recommended chokepoint: every mint, burn, and transfer routes
    // through it, so nothing can bypass this by calling a different entry
    // point. Approvals are blocked too, purely so the UI never suggests a
    // transfer is possible — the _update guard is what actually enforces it.

    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert CredentialTransfersDisabled();
        }
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public virtual override {
        revert CredentialTransfersDisabled();
    }

    function setApprovalForAll(address, bool) public virtual override {
        revert CredentialTransfersDisabled();
    }
}
