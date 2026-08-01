// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {VerificationProviderRegistry} from "../src/VerificationProviderRegistry.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

contract VerificationProviderRegistryTest is Test {
    VerificationProviderRegistry registry;
    address owner = address(0xA11CE);
    address stranger = address(0xB0B);

    function setUp() public {
        vm.prank(owner);
        registry = new VerificationProviderRegistry();
    }

    function test_deployerIsOwner() public view {
        assertEq(registry.owner(), owner);
    }

    function test_ownerCanAddProvider() public {
        vm.prank(owner);
        registry.addProvider("reclaim", "Reclaim Protocol");

        assertTrue(registry.isTrustedProvider("reclaim"));
        assertEq(registry.providerName("reclaim"), "Reclaim Protocol");
    }

    function test_unknownProviderIsNotTrusted() public view {
        assertFalse(registry.isTrustedProvider("nonexistent"));
    }

    function test_strangerCannotAddProvider() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registry.addProvider("reclaim", "Reclaim Protocol");
    }

    function test_ownerCanRemoveProvider() public {
        vm.startPrank(owner);
        registry.addProvider("reclaim", "Reclaim Protocol");
        assertTrue(registry.isTrustedProvider("reclaim"));

        registry.removeProvider("reclaim");
        assertFalse(registry.isTrustedProvider("reclaim"));
        vm.stopPrank();
    }

    function test_strangerCannotRemoveProvider() public {
        vm.prank(owner);
        registry.addProvider("reclaim", "Reclaim Protocol");

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registry.removeProvider("reclaim");
    }
}
