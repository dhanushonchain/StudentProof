// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {VerificationProviderRegistry} from "../src/VerificationProviderRegistry.sol";
import {StudentCredentialRegistry} from "../src/StudentCredentialRegistry.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {IERC721Errors} from "openzeppelin-contracts/contracts/interfaces/draft-IERC6093.sol";

contract StudentCredentialRegistryTest is Test {
    VerificationProviderRegistry registry;
    StudentCredentialRegistry credential;

    address owner = address(0xA11CE);
    address minter = address(0x1177E4);
    address stranger = address(0xB0B);
    address student = address(0x57DEA7);
    address anotherStudent = address(0x57DEA7B);

    uint256 farFuture;

    function setUp() public {
        farFuture = block.timestamp + 365 days;

        vm.startPrank(owner);
        registry = new VerificationProviderRegistry();
        registry.addProvider("reclaim", "Reclaim Protocol");
        credential = new StudentCredentialRegistry(address(registry), minter);
        vm.stopPrank();
    }

    function test_constructorWiring() public view {
        assertEq(address(credential.providerRegistry()), address(registry));
        assertEq(credential.authorizedMinter(), minter);
        assertEq(credential.owner(), owner);
    }

    function test_minterCanMintForTrustedProvider() public {
        vm.prank(minter);
        uint256 tokenId = credential.mintCredential(student, "reclaim", farFuture);

        assertEq(tokenId, 1);
        assertTrue(credential.hasValidCredential(student));
        assertEq(credential.ownerOf(tokenId), student);
        assertEq(credential.balanceOf(student), 1);

        StudentCredentialRegistry.CredentialData memory data = credential.credentialData(tokenId);
        assertEq(data.providerId, "reclaim");
        assertEq(data.issuedAt, block.timestamp);
        assertEq(data.expiresAt, farFuture);
        assertFalse(data.revoked);
    }

    function test_tokenURIReturnsBase64JsonWithImage() public {
        vm.prank(minter);
        uint256 tokenId = credential.mintCredential(student, "reclaim", farFuture);

        string memory uri = credential.tokenURI(tokenId);
        assertTrue(_startsWith(uri, "data:application/json;base64,"));
    }

    function test_tokenURIRevertsForNonexistentToken() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 999));
        credential.tokenURI(999);
    }

    function _startsWith(string memory str, string memory prefix) private pure returns (bool) {
        bytes memory strBytes = bytes(str);
        bytes memory prefixBytes = bytes(prefix);
        if (strBytes.length < prefixBytes.length) return false;
        for (uint256 i = 0; i < prefixBytes.length; i++) {
            if (strBytes[i] != prefixBytes[i]) return false;
        }
        return true;
    }

    function test_strangerCannotMint() public {
        vm.prank(stranger);
        vm.expectRevert(StudentCredentialRegistry.NotAuthorizedMinter.selector);
        credential.mintCredential(student, "reclaim", farFuture);
    }

    function test_ownerCannotMintEither() public {
        // Only the authorizedMinter can mint — being contract owner is not enough.
        vm.prank(owner);
        vm.expectRevert(StudentCredentialRegistry.NotAuthorizedMinter.selector);
        credential.mintCredential(student, "reclaim", farFuture);
    }

    function test_cannotMintForUntrustedProvider() public {
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(StudentCredentialRegistry.ProviderNotTrusted.selector, "fakeprovider"));
        credential.mintCredential(student, "fakeprovider", farFuture);
    }

    // Duplicate-credential prevention was deliberately dropped for MVP scope
    // (see the contract's top-level NatSpec) — a wallet minting for the same
    // provider twice is now expected, supported behavior, not an error.
    function test_walletCanMintMultipleCredentials() public {
        vm.startPrank(minter);
        uint256 first = credential.mintCredential(student, "reclaim", farFuture);
        uint256 second = credential.mintCredential(student, "reclaim", farFuture);
        vm.stopPrank();

        assertTrue(first != second);
        assertEq(credential.balanceOf(student), 2);
        assertTrue(credential.hasValidCredential(student));
    }

    function test_differentWalletsGetDifferentTokenIds() public {
        vm.startPrank(minter);
        uint256 first = credential.mintCredential(student, "reclaim", farFuture);
        uint256 second = credential.mintCredential(anotherStudent, "reclaim", farFuture);
        vm.stopPrank();

        assertTrue(first != second);
        assertTrue(credential.hasValidCredential(student));
        assertTrue(credential.hasValidCredential(anotherStudent));
    }

    function test_hasValidCredentialFalseForNeverMinted() public view {
        assertFalse(credential.hasValidCredential(student));
    }

    function test_hasValidCredentialFalseWhenExpired() public {
        uint256 expiresAt = block.timestamp + 1 days;
        vm.prank(minter);
        credential.mintCredential(student, "reclaim", expiresAt);

        assertTrue(credential.hasValidCredential(student));

        vm.warp(expiresAt + 1);
        assertFalse(credential.hasValidCredential(student));
        // Still on-chain, still owned — just no longer "valid".
        assertEq(credential.balanceOf(student), 1);
    }

    function test_hasValidCredentialTrueWhenOneOfSeveralStillActive() public {
        uint256 soonExpires = block.timestamp + 1 days;

        vm.startPrank(minter);
        credential.mintCredential(student, "reclaim", soonExpires); // will expire
        credential.mintCredential(student, "reclaim", farFuture); // stays active
        vm.stopPrank();

        vm.warp(soonExpires + 1);
        assertTrue(credential.hasValidCredential(student));
        assertEq(credential.balanceOf(student), 2);
    }

    function test_transferReverts() public {
        vm.prank(minter);
        uint256 tokenId = credential.mintCredential(student, "reclaim", farFuture);

        vm.prank(student);
        vm.expectRevert(StudentCredentialRegistry.CredentialTransfersDisabled.selector);
        credential.transferFrom(student, stranger, tokenId);
    }

    function test_safeTransferReverts() public {
        vm.prank(minter);
        uint256 tokenId = credential.mintCredential(student, "reclaim", farFuture);

        vm.prank(student);
        vm.expectRevert(StudentCredentialRegistry.CredentialTransfersDisabled.selector);
        credential.safeTransferFrom(student, stranger, tokenId);
    }

    function test_approveReverts() public {
        vm.prank(minter);
        uint256 tokenId = credential.mintCredential(student, "reclaim", farFuture);

        vm.prank(student);
        vm.expectRevert(StudentCredentialRegistry.CredentialTransfersDisabled.selector);
        credential.approve(stranger, tokenId);
    }

    function test_setApprovalForAllReverts() public {
        vm.prank(student);
        vm.expectRevert(StudentCredentialRegistry.CredentialTransfersDisabled.selector);
        credential.setApprovalForAll(stranger, true);
    }

    function test_ownerCanRevokeCredential() public {
        vm.prank(minter);
        uint256 tokenId = credential.mintCredential(student, "reclaim", farFuture);
        assertTrue(credential.hasValidCredential(student));

        vm.prank(owner);
        credential.revokeCredential(tokenId);

        assertFalse(credential.hasValidCredential(student));
        assertTrue(credential.credentialData(tokenId).revoked);
        // The token itself still exists on-chain (soft revoke, not a burn).
        assertEq(credential.balanceOf(student), 1);
    }

    function test_revokedCredentialInvalidEvenIfNotExpired() public {
        vm.prank(minter);
        uint256 tokenId = credential.mintCredential(student, "reclaim", farFuture);

        vm.prank(owner);
        credential.revokeCredential(tokenId);

        // Far from expired, but revoked — must not count as valid.
        assertFalse(credential.hasValidCredential(student));
    }

    function test_strangerCannotRevoke() public {
        vm.prank(minter);
        uint256 tokenId = credential.mintCredential(student, "reclaim", farFuture);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        credential.revokeCredential(tokenId);
    }

    function test_revokeWithNoCredentialReverts() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(StudentCredentialRegistry.NoCredential.selector, 999));
        credential.revokeCredential(999);
    }

    function test_ownerCanRotateMinter() public {
        address newMinter = address(0xC0FFEE);

        vm.prank(owner);
        credential.setAuthorizedMinter(newMinter);
        assertEq(credential.authorizedMinter(), newMinter);

        // Old minter is no longer authorized.
        vm.prank(minter);
        vm.expectRevert(StudentCredentialRegistry.NotAuthorizedMinter.selector);
        credential.mintCredential(student, "reclaim", farFuture);

        // New minter works.
        vm.prank(newMinter);
        credential.mintCredential(student, "reclaim", farFuture);
        assertTrue(credential.hasValidCredential(student));
    }

    function test_strangerCannotRotateMinter() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        credential.setAuthorizedMinter(stranger);
    }

    function test_getCredentialsByOwnerReturnsAllWithMatchingTokenIds() public {
        vm.startPrank(minter);
        uint256 first = credential.mintCredential(student, "reclaim", farFuture);
        uint256 second = credential.mintCredential(student, "reclaim", farFuture + 1);
        vm.stopPrank();

        (uint256[] memory tokenIds, StudentCredentialRegistry.CredentialData[] memory credentials) =
            credential.getCredentialsByOwner(student);

        assertEq(tokenIds.length, 2);
        assertEq(credentials.length, 2);
        assertEq(tokenIds[0], first);
        assertEq(tokenIds[1], second);
        assertEq(credentials[0].expiresAt, farFuture);
        assertEq(credentials[1].expiresAt, farFuture + 1);
    }

    function test_getCredentialsByOwnerEmptyForNeverMinted() public view {
        (uint256[] memory tokenIds, StudentCredentialRegistry.CredentialData[] memory credentials) =
            credential.getCredentialsByOwner(student);
        assertEq(tokenIds.length, 0);
        assertEq(credentials.length, 0);
    }

    function test_enumerableTotalSupplyAndTokenByIndex() public {
        vm.startPrank(minter);
        credential.mintCredential(student, "reclaim", farFuture);
        credential.mintCredential(anotherStudent, "reclaim", farFuture);
        vm.stopPrank();

        assertEq(credential.totalSupply(), 2);
        assertEq(credential.tokenByIndex(0), 1);
        assertEq(credential.tokenByIndex(1), 2);
    }
}
