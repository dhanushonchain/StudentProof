// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {VerificationProviderRegistry} from "../src/VerificationProviderRegistry.sol";
import {StudentCredentialRegistry} from "../src/StudentCredentialRegistry.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

contract StudentCredentialRegistryTest is Test {
    VerificationProviderRegistry registry;
    StudentCredentialRegistry credential;

    address owner = address(0xA11CE);
    address minter = address(0x1177E4);
    address stranger = address(0xB0B);
    address student = address(0x57DEA7);
    address anotherStudent = address(0x57DEA7B);

    function setUp() public {
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
        uint256 tokenId = credential.mintCredential(student, "reclaim");

        assertEq(tokenId, 1);
        assertTrue(credential.hasValidCredential(student));
        assertEq(credential.ownerOf(tokenId), student);
        assertEq(credential.balanceOf(student), 1);

        StudentCredentialRegistry.CredentialData memory data = credential.credentialOf(student);
        assertEq(data.providerId, "reclaim");
        assertEq(data.issuedAt, block.timestamp);
    }

    function test_strangerCannotMint() public {
        vm.prank(stranger);
        vm.expectRevert(StudentCredentialRegistry.NotAuthorizedMinter.selector);
        credential.mintCredential(student, "reclaim");
    }

    function test_ownerCannotMintEither() public {
        // Only the authorizedMinter can mint — being contract owner is not enough.
        vm.prank(owner);
        vm.expectRevert(StudentCredentialRegistry.NotAuthorizedMinter.selector);
        credential.mintCredential(student, "reclaim");
    }

    function test_cannotMintForUntrustedProvider() public {
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(StudentCredentialRegistry.ProviderNotTrusted.selector, "fakeprovider"));
        credential.mintCredential(student, "fakeprovider");
    }

    function test_cannotMintDuplicateForSameWallet() public {
        vm.startPrank(minter);
        credential.mintCredential(student, "reclaim");

        vm.expectRevert(abi.encodeWithSelector(StudentCredentialRegistry.CredentialAlreadyIssued.selector, student));
        credential.mintCredential(student, "reclaim");
        vm.stopPrank();
    }

    function test_differentWalletsGetDifferentTokenIds() public {
        vm.startPrank(minter);
        uint256 first = credential.mintCredential(student, "reclaim");
        uint256 second = credential.mintCredential(anotherStudent, "reclaim");
        vm.stopPrank();

        assertTrue(first != second);
        assertTrue(credential.hasValidCredential(student));
        assertTrue(credential.hasValidCredential(anotherStudent));
    }

    function test_hasValidCredentialFalseForNeverMinted() public view {
        assertFalse(credential.hasValidCredential(student));
    }

    function test_transferReverts() public {
        vm.prank(minter);
        uint256 tokenId = credential.mintCredential(student, "reclaim");

        vm.prank(student);
        vm.expectRevert(StudentCredentialRegistry.CredentialTransfersDisabled.selector);
        credential.transferFrom(student, stranger, tokenId);
    }

    function test_safeTransferReverts() public {
        vm.prank(minter);
        uint256 tokenId = credential.mintCredential(student, "reclaim");

        vm.prank(student);
        vm.expectRevert(StudentCredentialRegistry.CredentialTransfersDisabled.selector);
        credential.safeTransferFrom(student, stranger, tokenId);
    }

    function test_approveReverts() public {
        vm.prank(minter);
        uint256 tokenId = credential.mintCredential(student, "reclaim");

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
        credential.mintCredential(student, "reclaim");
        assertTrue(credential.hasValidCredential(student));

        vm.prank(owner);
        credential.revokeCredential(student);

        assertFalse(credential.hasValidCredential(student));
        // The token itself still exists on-chain (soft revoke, not a burn).
        assertEq(credential.balanceOf(student), 1);
    }

    function test_strangerCannotRevoke() public {
        vm.prank(minter);
        credential.mintCredential(student, "reclaim");

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        credential.revokeCredential(student);
    }

    function test_revokeWithNoCredentialReverts() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(StudentCredentialRegistry.NoCredential.selector, student));
        credential.revokeCredential(student);
    }

    function test_ownerCanRotateMinter() public {
        address newMinter = address(0xC0FFEE);

        vm.prank(owner);
        credential.setAuthorizedMinter(newMinter);
        assertEq(credential.authorizedMinter(), newMinter);

        // Old minter is no longer authorized.
        vm.prank(minter);
        vm.expectRevert(StudentCredentialRegistry.NotAuthorizedMinter.selector);
        credential.mintCredential(student, "reclaim");

        // New minter works.
        vm.prank(newMinter);
        credential.mintCredential(student, "reclaim");
        assertTrue(credential.hasValidCredential(student));
    }

    function test_strangerCannotRotateMinter() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        credential.setAuthorizedMinter(stranger);
    }
}
