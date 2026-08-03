// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "openzeppelin-contracts/contracts/token/ERC721/IERC721.sol";
import {ERC721Enumerable} from "openzeppelin-contracts/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Base64} from "openzeppelin-contracts/contracts/utils/Base64.sol";
import {Strings} from "openzeppelin-contracts/contracts/utils/Strings.sol";
import {VerificationProviderRegistry} from "./VerificationProviderRegistry.sol";

/// @notice Soulbound (non-transferable) student credentials. A wallet may
/// hold multiple credentials over its lifetime — e.g. a BSc credential,
/// later a separate MSc credential — each mint is an independent, permanent
/// record; nothing is ever overwritten or burned. Stores no personal data
/// on-chain — only which provider verified the holder, when, and until when.
///
/// mintCredential is gated by `onlyMinter`, not left open to any caller: an
/// unrestricted mint would let anyone issue themselves a "verified student"
/// credential for a trusted providerId without ever actually verifying
/// anything, since this contract has no way to itself check that an
/// off-chain proof happened. The backend's dedicated minter wallet is the
/// only account trusted to assert "this address genuinely verified".
///
/// No duplicate-credential prevention: a wallet can accumulate more than one
/// active credential for what is off-chain the "same" programme. This is a
/// deliberate MVP scope decision (see project history) — the contract has no
/// on-chain concept of "programme" at all, by design, to avoid putting even
/// a shared/non-unique academic-programme identifier on a permanent public
/// ledger. Revisit only if real duplicate mints turn out to matter in
/// practice.
contract StudentCredentialRegistry is ERC721Enumerable, Ownable {
    struct CredentialData {
        string providerId;
        uint256 issuedAt;
        uint256 expiresAt;
        bool revoked;
    }

    VerificationProviderRegistry public immutable providerRegistry;
    address public authorizedMinter;

    // Same badge image for every token — no per-student data, matches the
    // rest of this contract storing nothing beyond provider + timestamps.
    string private constant IMAGE_URI = "https://studentproof.app/nft/pos-nft.png";

    uint256 private _nextTokenId = 1;
    mapping(uint256 => CredentialData) private _credentialData;

    event CredentialMinted(
        address indexed student, uint256 indexed tokenId, string providerId, uint256 issuedAt, uint256 expiresAt
    );
    event CredentialRevoked(address indexed student, uint256 indexed tokenId);
    event MinterUpdated(address indexed previousMinter, address indexed newMinter);

    error NotAuthorizedMinter();
    error ProviderNotTrusted(string providerId);
    error CredentialTransfersDisabled();
    error NoCredential(uint256 tokenId);

    modifier onlyMinter() {
        if (msg.sender != authorizedMinter) revert NotAuthorizedMinter();
        _;
    }

    constructor(address registryAddress, address initialMinter) ERC721("StudentProof", "SPROOF") Ownable(msg.sender) {
        providerRegistry = VerificationProviderRegistry(registryAddress);
        authorizedMinter = initialMinter;
        emit MinterUpdated(address(0), initialMinter);
    }

    /// @notice Rotate which wallet is allowed to mint, without redeploying.
    function setAuthorizedMinter(address newMinter) external onlyOwner {
        emit MinterUpdated(authorizedMinter, newMinter);
        authorizedMinter = newMinter;
    }

    /// @notice Mint a new credential for `student`. issuedAt is always the
    /// real mint time, set on-chain — expiresAt is supplied by the caller,
    /// computed off-chain from programme/admission data that never touches
    /// this contract. No restriction on how many credentials a wallet may
    /// hold; see the contract-level note on duplicate prevention.
    function mintCredential(address student, string calldata providerId, uint256 expiresAt)
        external
        onlyMinter
        returns (uint256)
    {
        if (!providerRegistry.isTrustedProvider(providerId)) revert ProviderNotTrusted(providerId);

        uint256 tokenId = _nextTokenId++;
        _credentialData[tokenId] =
            CredentialData({providerId: providerId, issuedAt: block.timestamp, expiresAt: expiresAt, revoked: false});

        _safeMint(student, tokenId);

        emit CredentialMinted(student, tokenId, providerId, block.timestamp, expiresAt);
        return tokenId;
    }

    /// @notice Soft-revoke one specific credential by tokenId — independent
    /// of natural expiry (see hasValidCredential). The token stays on-chain
    /// permanently, preserving the audit trail; only its validity flips.
    function revokeCredential(uint256 tokenId) external onlyOwner {
        address holder = _ownerOf(tokenId);
        if (holder == address(0)) revert NoCredential(tokenId);

        _credentialData[tokenId].revoked = true;
        emit CredentialRevoked(holder, tokenId);
    }

    /// @notice True if `wallet` owns at least one credential that is neither
    /// revoked nor expired. Loops over the wallet's tokens — unbounded, but
    /// this is a `view` function (free off-chain via eth_call); would need
    /// bounding if it were ever called from a state-changing transaction.
    function hasValidCredential(address wallet) external view returns (bool) {
        uint256 balance = balanceOf(wallet);
        for (uint256 i = 0; i < balance; i++) {
            CredentialData storage data = _credentialData[tokenOfOwnerByIndex(wallet, i)];
            if (!data.revoked && data.expiresAt > block.timestamp) {
                return true;
            }
        }
        return false;
    }

    function credentialData(uint256 tokenId) external view returns (CredentialData memory) {
        if (_ownerOf(tokenId) == address(0)) revert NoCredential(tokenId);
        return _credentialData[tokenId];
    }

    /// @notice All credentials owned by `wallet`, in token-index order —
    /// parallel arrays rather than tokenId embedded in CredentialData itself,
    /// to avoid adding a storage field only needed by this one bulk read.
    function getCredentialsByOwner(address wallet)
        external
        view
        returns (uint256[] memory tokenIds, CredentialData[] memory credentials)
    {
        uint256 balance = balanceOf(wallet);
        tokenIds = new uint256[](balance);
        credentials = new CredentialData[](balance);
        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId = tokenOfOwnerByIndex(wallet, i);
            tokenIds[i] = tokenId;
            credentials[i] = _credentialData[tokenId];
        }
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        _requireOwned(tokenId);

        string memory json = string.concat(
            '{"name":"Proof of Student #',
            Strings.toString(tokenId),
            '","description":"A soulbound StudentProof credential, verified via Reclaim Protocol.",',
            '"image":"',
            IMAGE_URI,
            '"}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    // --- Soulbound: block every transfer path, mint/burn still allowed ---
    // Overriding _update (rather than just transferFrom/safeTransferFrom) is
    // the OZ v5-recommended chokepoint: every mint, burn, and transfer routes
    // through it, so nothing can bypass this by calling a different entry
    // point. It's also ERC721Enumerable's own override point — calling
    // super._update(...) here chains into ERC721Enumerable's ownership-index
    // bookkeeping automatically. Approvals are blocked too, purely so the UI
    // never suggests a transfer is possible — the _update guard is what
    // actually enforces it.

    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert CredentialTransfersDisabled();
        }
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public virtual override(ERC721, IERC721) {
        revert CredentialTransfersDisabled();
    }

    function setApprovalForAll(address, bool) public virtual override(ERC721, IERC721) {
        revert CredentialTransfersDisabled();
    }
}
