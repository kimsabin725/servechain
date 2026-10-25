// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ServiceNotice721} from "../src/ServiceNotice721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

contract ServiceNotice721Test is Test {
    ServiceNotice721 nft;
    address issuer = makeAddr("issuer");
    address served = makeAddr("served");
    address other = makeAddr("other");
    bytes32 constant CASE = bytes32(uint256(0xca5e));
    bytes32 constant DOCS = 0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08;
    string constant URL = "https://example.org/service/700647";

    function setUp() public {
        nft = new ServiceNotice721(issuer);
    }

    function _mint() internal returns (uint256) {
        vm.prank(issuer);
        return nft.mint(served, CASE, 2, URL, DOCS);
    }

    function _expectedUri(uint256 id) internal pure returns (string memory) {
        string memory h = "0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
        bytes memory json = abi.encodePacked(
            '{"name":"Notice of Lawsuit #', vm.toString(id),
            '","description":"Service documents are posted at external_url. SHA-256 of the document bundle: ', h,
            '","external_url":"', URL,
            '","attributes":[{"trait_type":"caseId","value":"0x000000000000000000000000000000000000000000000000000000000000ca5e"},{"trait_type":"conditionId","value":2},{"trait_type":"documentsSha256","value":"',
            h, '"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    function test_MintFixesUrlAndHash() public {
        vm.expectEmit(true, true, true, true);
        emit ServiceNotice721.NoticeServed(1, CASE, 2, served, DOCS, URL);
        uint256 id = _mint();
        assertEq(id, 1);
        assertEq(nft.ownerOf(id), served);
        ServiceNotice721.Notice memory n = nft.noticeOf(id);
        assertEq(n.documentsHash, DOCS);
        assertEq(n.documentsUrl, URL);
        assertEq(n.caseId, CASE);
        assertEq(n.conditionId, 2);
        assertEq(nft.tokenURI(id), _expectedUri(id));
        assertTrue(nft.locked(id));
        assertTrue(nft.supportsInterface(0xb45a3c0e));
        assertTrue(nft.supportsInterface(0x80ac58cd));
    }

    function test_Attack_HolderTransfers() public {
        uint256 id = _mint();
        vm.prank(served);
        vm.expectRevert(ServiceNotice721.Soulbound.selector);
        nft.transferFrom(served, other, id);
        vm.prank(served);
        vm.expectRevert(ServiceNotice721.Soulbound.selector);
        nft.safeTransferFrom(served, other, id);
        assertEq(nft.ownerOf(id), served);
    }

    function test_Attack_IssuerMovesServedToken() public {
        uint256 id = _mint();
        vm.prank(issuer);
        vm.expectRevert();
        nft.transferFrom(served, other, id);
        assertEq(nft.ownerOf(id), served);
    }

    function test_Attack_Approvals() public {
        uint256 id = _mint();
        vm.startPrank(served);
        vm.expectRevert(ServiceNotice721.Soulbound.selector);
        nft.approve(other, id);
        vm.expectRevert(ServiceNotice721.Soulbound.selector);
        nft.setApprovalForAll(other, true);
        vm.stopPrank();
    }

    function test_Attack_UnauthorizedMint() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        nft.mint(served, CASE, 2, URL, DOCS);
    }

    function test_Attack_ChangeTokenUri() public {
        uint256 id = _mint();
        string memory before = nft.tokenURI(id);
        vm.startPrank(issuer);
        (bool ok,) = address(nft).call(abi.encodeWithSignature("setTokenURI(uint256,string)", id, "https://evil.example"));
        assertFalse(ok);
        (ok,) = address(nft).call(abi.encodeWithSignature("setBaseURI(string)", "https://evil.example/"));
        assertFalse(ok);
        nft.transferOwnership(other);
        vm.stopPrank();
        vm.warp(block.timestamp + 365 days);
        assertEq(nft.tokenURI(id), before);
        assertEq(nft.noticeOf(id).documentsHash, DOCS);
    }

    function test_Attack_JsonInjectionInUrl() public {
        vm.startPrank(issuer);
        vm.expectRevert(ServiceNotice721.InvalidUrlChar.selector);
        nft.mint(served, CASE, 2, 'https://x.org/","external_url":"https://evil', DOCS);
        vm.expectRevert(ServiceNotice721.InvalidUrlChar.selector);
        nft.mint(served, CASE, 2, "https://x.org/a b", DOCS);
        vm.expectRevert(ServiceNotice721.EmptyUrl.selector);
        nft.mint(served, CASE, 2, "", DOCS);
        vm.stopPrank();
    }

    function test_Attack_EmptyHashOrRecipient() public {
        vm.startPrank(issuer);
        vm.expectRevert(ServiceNotice721.EmptyHash.selector);
        nft.mint(served, CASE, 2, URL, bytes32(0));
        vm.expectRevert(ServiceNotice721.ZeroRecipient.selector);
        nft.mint(address(0), CASE, 2, URL, DOCS);
        vm.stopPrank();
    }

    function test_EachWalletGetsOwnToken() public {
        vm.startPrank(issuer);
        uint256 a = nft.mint(served, CASE, 2, URL, DOCS);
        uint256 b = nft.mint(other, CASE, 2, URL, DOCS);
        vm.stopPrank();
        assertEq(nft.ownerOf(a), served);
        assertEq(nft.ownerOf(b), other);
        assertEq(nft.totalMinted(), 2);
    }
}
