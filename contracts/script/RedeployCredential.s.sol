// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {StudentCredentialRegistry} from "../src/StudentCredentialRegistry.sol";

/// Redeploys only StudentCredentialRegistry against the already-deployed
/// VerificationProviderRegistry — used when the credential contract itself
/// changes (e.g. name/metadata) but the provider registry doesn't.
///
/// Reads PRIVATE_KEY (deployer/owner), MINTER_ADDRESS, and
/// VERIFICATION_PROVIDER_REGISTRY_ADDRESS from the environment.
contract RedeployCredentialScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address minter = vm.envAddress("MINTER_ADDRESS");
        address registry = vm.envAddress("VERIFICATION_PROVIDER_REGISTRY_ADDRESS");

        vm.startBroadcast(deployerKey);

        StudentCredentialRegistry credential = new StudentCredentialRegistry(registry, minter);
        console.log("StudentCredentialRegistry deployed at:", address(credential));

        vm.stopBroadcast();
    }
}
