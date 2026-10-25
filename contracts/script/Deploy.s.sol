// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ServiceNotice721} from "../src/ServiceNotice721.sol";
import {CaseFileRegistry} from "../src/CaseFileRegistry.sol";

contract Deploy is Script {
    error ChainNotAllowed(uint256 chainId);

    // Reverts unless running on anvil (31337) or Sepolia (11155111).
    function checkChain() public view {
        if (block.chainid != 31337 && block.chainid != 11155111) revert ChainNotAllowed(block.chainid);
    }

    // Deploys both contracts and writes deployments/<chainId>.json.
    function run() external {
        checkChain();
        address issuer = msg.sender;
        vm.startBroadcast();
        ServiceNotice721 notice = new ServiceNotice721(issuer);
        CaseFileRegistry registry = new CaseFileRegistry();
        vm.stopBroadcast();

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "blockNumber", block.number);
        vm.serializeAddress(key, "issuer", issuer);
        vm.serializeAddress(key, "ServiceNotice721", address(notice));
        string memory json = vm.serializeAddress(key, "CaseFileRegistry", address(registry));
        string memory path = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console.log("written", path);
    }
}
