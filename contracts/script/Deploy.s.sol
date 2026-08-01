// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {VerificationProviderRegistry} from "../src/VerificationProviderRegistry.sol";
import {StudentCredentialRegistry} from "../src/StudentCredentialRegistry.sol";

/// Deploys both contracts to whichever network is targeted, in dependency
/// order (registry first, since the credential contract's constructor needs
/// its address), then registers "reclaim" as a trusted provider.
///
/// Reads PRIVATE_KEY (the deployer/owner) and MINTER_ADDRESS from the
/// environment — run with `forge script script/Deploy.s.sol --broadcast ...`.
contract DeployScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address minter = vm.envAddress("MINTER_ADDRESS");

        vm.startBroadcast(deployerKey);

        VerificationProviderRegistry registry = new VerificationProviderRegistry();
        console.log("VerificationProviderRegistry deployed at:", address(registry));

        StudentCredentialRegistry credential = new StudentCredentialRegistry(address(registry), minter);
        console.log("StudentCredentialRegistry deployed at:", address(credential));

        registry.addProvider("reclaim", "Reclaim Protocol");
        console.log("Registered 'reclaim' as a trusted provider");

        vm.stopBroadcast();
    }
}
