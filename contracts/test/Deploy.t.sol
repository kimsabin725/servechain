// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";

contract DeployGuardTest is Test {
    Deploy script;

    function setUp() public {
        script = new Deploy();
    }

    function test_AllowsAnvilAndSepolia() public {
        vm.chainId(31337);
        script.checkChain();
        vm.chainId(11155111);
        script.checkChain();
    }

    function test_Attack_RejectsMainnetAndOthers() public {
        uint256[4] memory ids = [uint256(1), 137, 728126428, 8453];
        for (uint256 i; i < ids.length; ++i) {
            vm.chainId(ids[i]);
            vm.expectRevert(abi.encodeWithSelector(Deploy.ChainNotAllowed.selector, ids[i]));
            script.run();
        }
    }
}
