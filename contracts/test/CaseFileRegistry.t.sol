// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CaseFileRegistry} from "../src/CaseFileRegistry.sol";

contract CaseFileRegistryTest is Test {
    CaseFileRegistry reg;
    address handler = makeAddr("handler");
    address stranger = makeAddr("stranger");
    bytes32 constant CASE = keccak256("NY-QUEENS-700647-2025");
    bytes32 constant ORDER = keccak256("order.pdf");
    bytes32 constant CONDS = keccak256("conditions.json");
    uint64 constant T0 = 1_750_000_000;
    uint64 serviceDeadline = T0 + 120 days;

    function setUp() public {
        vm.warp(T0);
        reg = new CaseFileRegistry();
        vm.prank(handler);
        reg.openCase(CASE, ORDER, CONDS, 5, serviceDeadline);
    }

    function _fulfillAll() internal {
        vm.startPrank(handler);
        for (uint8 i; i < 5; ++i) {
            reg.fulfill(CASE, i, keccak256(abi.encode("evidence", i)), keccak256(abi.encode("tx", i)));
        }
        vm.stopPrank();
    }

    function _serve(uint64 filedAt) internal {
        vm.prank(handler);
        reg.recordServiceComplete(CASE, keccak256("affidavit"), filedAt);
    }

    function test_FullFlow() public {
        CaseFileRegistry.CaseFile memory c = reg.getCase(CASE);
        assertEq(c.handler, handler);
        assertEq(c.conditionCount, 5);
        assertEq(c.serviceDeadline, serviceDeadline);

        vm.warp(T0 + 1 days);
        _fulfillAll();
        assertTrue(reg.allFulfilled(CASE));
        CaseFileRegistry.Fulfillment memory f = reg.getFulfillment(CASE, 2);
        assertEq(f.evidenceHash, keccak256(abi.encode("evidence", 2)));
        assertEq(f.fulfilledAt, T0 + 1 days);

        vm.warp(T0 + 10 days);
        uint64 filedAt = T0 + 9 days;
        vm.expectEmit(true, false, false, true);
        emit CaseFileRegistry.ServiceCompleted(CASE, keccak256("affidavit"), filedAt, filedAt + 30 days);
        _serve(filedAt);
        assertEq(reg.getCase(CASE).responseDeadline, filedAt + 30 days);
        assertFalse(reg.responsePeriodExpired(CASE));

        vm.warp(filedAt + 30 days + 1);
        assertTrue(reg.responsePeriodExpired(CASE));
        vm.prank(handler);
        reg.snapshot(CASE, keccak256("activity-root"));
        c = reg.getCase(CASE);
        assertEq(c.activityRootHash, keccak256("activity-root"));
        assertEq(c.snapshotAt, filedAt + 30 days + 1);
    }

    function test_PartialFulfillmentIsVisible() public {
        vm.prank(handler);
        reg.fulfill(CASE, 0, keccak256("e0"), bytes32(0));
        assertTrue(reg.isFulfilled(CASE, 0));
        assertFalse(reg.isFulfilled(CASE, 4));
        assertFalse(reg.allFulfilled(CASE));
        assertEq(reg.getCase(CASE).fulfilledMask, 1);
    }

    function testFuzz_DeadlineIsAlwaysFiledPlus30Days(uint64 offset) public {
        offset = uint64(bound(offset, 0, 365 days));
        vm.warp(T0 + 400 days);
        _serve(T0 + offset);
        assertEq(reg.getCase(CASE).responseDeadline, T0 + offset + 30 days);
    }

    function test_Attack_ExtendDeadlineByReRecording() public {
        vm.warp(T0 + 5 days);
        _serve(T0 + 5 days);
        vm.warp(T0 + 60 days);
        vm.prank(handler);
        vm.expectRevert(CaseFileRegistry.ServiceAlreadyRecorded.selector);
        reg.recordServiceComplete(CASE, keccak256("affidavit"), T0 + 60 days);
        assertEq(reg.getCase(CASE).responseDeadline, T0 + 35 days);
    }

    function test_Attack_ExtendDeadlineWithFutureFiledAt() public {
        vm.prank(handler);
        vm.expectRevert(CaseFileRegistry.FiledAtInFuture.selector);
        reg.recordServiceComplete(CASE, keccak256("affidavit"), T0 + 1);
    }

    function test_Attack_BackdateBeforeCaseOpened() public {
        vm.prank(handler);
        vm.expectRevert(CaseFileRegistry.FiledAtBeforeOpen.selector);
        reg.recordServiceComplete(CASE, keccak256("affidavit"), T0 - 1);
    }

    function test_Attack_NoExternalDeadlineSetter() public {
        (bool ok,) = address(reg).call(abi.encodeWithSignature("setResponseDeadline(bytes32,uint64)", CASE, T0 + 999 days));
        assertFalse(ok);
        (ok,) = address(reg).call(
            abi.encodeWithSignature("recordServiceComplete(bytes32,bytes32,uint64,uint64)", CASE, bytes32(uint256(1)), T0, T0 + 999 days)
        );
        assertFalse(ok);
    }

    function test_Attack_FulfillUnknownCondition() public {
        vm.startPrank(handler);
        vm.expectRevert(CaseFileRegistry.UnknownCondition.selector);
        reg.fulfill(CASE, 5, keccak256("e"), bytes32(0));
        vm.expectRevert(CaseFileRegistry.UnknownCondition.selector);
        reg.fulfill(CASE, 255, keccak256("e"), bytes32(0));
        vm.stopPrank();
    }

    function test_Attack_DoubleFulfill() public {
        vm.startPrank(handler);
        reg.fulfill(CASE, 1, keccak256("e1"), keccak256("tx1"));
        vm.expectRevert(CaseFileRegistry.AlreadyFulfilled.selector);
        reg.fulfill(CASE, 1, keccak256("forged"), keccak256("tx2"));
        vm.stopPrank();
        assertEq(reg.getFulfillment(CASE, 1).evidenceHash, keccak256("e1"));
        assertEq(reg.getCase(CASE).fulfilledCount, 1);
    }

    function test_Attack_StrangerFulfills() public {
        vm.prank(stranger);
        vm.expectRevert(CaseFileRegistry.NotHandler.selector);
        reg.fulfill(CASE, 0, keccak256("e"), bytes32(0));
    }

    function test_Attack_StrangerRecordsService() public {
        vm.prank(stranger);
        vm.expectRevert(CaseFileRegistry.NotHandler.selector);
        reg.recordServiceComplete(CASE, keccak256("affidavit"), T0);
    }

    function test_Attack_StrangerSnapshots() public {
        _serve(T0);
        vm.warp(T0 + 31 days);
        vm.prank(stranger);
        vm.expectRevert(CaseFileRegistry.NotHandler.selector);
        reg.snapshot(CASE, keccak256("root"));
    }

    function test_Attack_HijackCaseIdByReopening() public {
        vm.prank(stranger);
        vm.expectRevert(CaseFileRegistry.CaseExists.selector);
        reg.openCase(CASE, keccak256("fake"), keccak256("fake"), 1, serviceDeadline);
        assertEq(reg.getCase(CASE).handler, handler);
    }

    function test_Attack_FulfillMissingCase() public {
        vm.prank(handler);
        vm.expectRevert(CaseFileRegistry.CaseNotFound.selector);
        reg.fulfill(keccak256("nope"), 0, keccak256("e"), bytes32(0));
    }

    function test_Attack_SnapshotBeforeService() public {
        vm.warp(T0 + 200 days);
        vm.prank(handler);
        vm.expectRevert(CaseFileRegistry.ServiceNotRecorded.selector);
        reg.snapshot(CASE, keccak256("root"));
    }

    function test_Attack_SnapshotAtDeadline() public {
        _serve(T0);
        vm.warp(T0 + 30 days);
        vm.prank(handler);
        vm.expectRevert(CaseFileRegistry.ResponsePeriodOpen.selector);
        reg.snapshot(CASE, keccak256("root"));
    }

    function test_Attack_SecondSnapshot() public {
        _serve(T0);
        vm.warp(T0 + 31 days);
        vm.startPrank(handler);
        reg.snapshot(CASE, keccak256("root"));
        vm.expectRevert(CaseFileRegistry.SnapshotExists.selector);
        reg.snapshot(CASE, keccak256("root2"));
        vm.stopPrank();
    }

    function test_Attack_OpenCaseBadInput() public {
        vm.startPrank(stranger);
        vm.expectRevert(CaseFileRegistry.DeadlineInPast.selector);
        reg.openCase(keccak256("c2"), ORDER, CONDS, 5, T0);
        vm.expectRevert(CaseFileRegistry.NoConditions.selector);
        reg.openCase(keccak256("c2"), ORDER, CONDS, 0, serviceDeadline);
        vm.expectRevert(CaseFileRegistry.ZeroHash.selector);
        reg.openCase(keccak256("c2"), bytes32(0), CONDS, 5, serviceDeadline);
        vm.stopPrank();
    }

    function test_Attack_ZeroEvidence() public {
        vm.prank(handler);
        vm.expectRevert(CaseFileRegistry.ZeroHash.selector);
        reg.fulfill(CASE, 0, bytes32(0), bytes32(0));
    }
}
