// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {ServiceNotice721} from "../src/ServiceNotice721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

contract Reenterer {
    ServiceNotice721 nft;
    bool public called;

    constructor(ServiceNotice721 n) {
        nft = n;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        called = true;
        nft.mint(address(this), bytes32(uint256(1)), 0, "https://x.org", bytes32(uint256(1)));
        return this.onERC721Received.selector;
    }
}

contract NoReceiver {}

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
            '","image":"', _expectedImage(id),
            '","external_url":"', URL,
            '","attributes":[{"trait_type":"caseId","value":"0x000000000000000000000000000000000000000000000000000000000000ca5e"},{"trait_type":"conditionId","value":2},{"trait_type":"documentsSha256","value":"',
            h, '"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    function _expectedImage(uint256 id) internal pure returns (string memory) {
        return _image("0x00000000", id);
    }

    function _image(string memory casePrefix, uint256 id) internal pure returns (string memory) {
        bytes memory svg = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#fffefb" stroke="#1d1c1a" stroke-width="12"/>',
            '<text x="200" y="170" font-family="serif" font-size="34" font-weight="700" text-anchor="middle" fill="#1d1c1a">SERVICE NOTICE</text>',
            '<text x="200" y="220" font-family="monospace" font-size="20" text-anchor="middle" fill="#1d1c1a">case ', casePrefix,
            '</text><text x="200" y="260" font-family="monospace" font-size="20" text-anchor="middle" fill="#4a4843">#',
            vm.toString(id),
            "</text></svg>"
        );
        return string.concat("data:image/svg+xml;base64,", Base64.encode(svg));
    }

    function test_ImageShowsCasePrefix() public {
        bytes32 caseId = 0xabcdef0123456789000000000000000000000000000000000000000000000000;
        vm.prank(issuer);
        uint256 id = nft.mint(served, caseId, 0, URL, DOCS);
        string memory h = "0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
        bytes memory json = abi.encodePacked(
            '{"name":"Notice of Lawsuit #1","description":"Service documents are posted at external_url. SHA-256 of the document bundle: ', h,
            '","image":"', _image("0xabcdef01", 1), '","external_url":"', URL,
            '","attributes":[{"trait_type":"caseId","value":"', vm.toString(caseId),
            '"},{"trait_type":"conditionId","value":0},{"trait_type":"documentsSha256","value":"', h, '"}]}'
        );
        assertEq(nft.tokenURI(id), string.concat("data:application/json;base64,", Base64.encode(json)));
    }

    function test_OwnershipIsTwoStepAndCannotBeRenounced() public {
        vm.prank(issuer);
        vm.expectRevert(ServiceNotice721.RenounceDisabled.selector);
        nft.renounceOwnership();
        assertEq(nft.owner(), issuer);
        vm.prank(issuer);
        nft.transferOwnership(other);
        assertEq(nft.owner(), issuer);
        assertEq(nft.pendingOwner(), other);
        vm.prank(served);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, served));
        nft.acceptOwnership();
        vm.prank(other);
        nft.acceptOwnership();
        assertEq(nft.owner(), other);
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

    function test_Attack_SecondNoticeSameCaseConditionRecipient() public {
        uint256 id = _mint();
        vm.startPrank(issuer);
        vm.expectRevert(ServiceNotice721.AlreadyServed.selector);
        nft.mint(served, CASE, 2, "https://example.org/other", keccak256("other"));
        uint256 c3 = nft.mint(served, CASE, 3, URL, DOCS);
        uint256 otherCase = nft.mint(served, bytes32(uint256(0xbeef)), 2, URL, DOCS);
        vm.stopPrank();
        assertEq(nft.servedToken(nft.serviceKey(CASE, 2, served)), id);
        assertEq(nft.servedToken(nft.serviceKey(CASE, 3, served)), c3);
        assertEq(otherCase, 3);
        assertEq(nft.totalMinted(), 3);
    }

    function test_Attack_NonAsciiUrlRejected() public {
        vm.startPrank(issuer);
        vm.expectRevert(ServiceNotice721.InvalidUrlChar.selector);
        nft.mint(served, CASE, 2, unicode"https://exämple.org/a", DOCS);
        vm.expectRevert(ServiceNotice721.InvalidUrlChar.selector);
        nft.mint(served, CASE, 2, string(abi.encodePacked("https://x.org/", bytes1(0x80))), DOCS);
        vm.expectRevert(ServiceNotice721.InvalidUrlChar.selector);
        nft.mint(served, CASE, 2, string(abi.encodePacked("https://x.org/", bytes1(0xff))), DOCS);
        vm.expectRevert(ServiceNotice721.InvalidUrlChar.selector);
        nft.mint(served, CASE, 2, string(abi.encodePacked("https://x.org/", bytes1(0x7f))), DOCS);
        uint256 id = nft.mint(served, CASE, 2, "https://xn--exmple-cua.org/%C3%A4~", DOCS);
        vm.stopPrank();
        assertEq(nft.noticeOf(id).documentsUrl, "https://xn--exmple-cua.org/%C3%A4~");
    }

    function test_MintSkipsReceiverCallback() public {
        Reenterer r = new Reenterer(nft);
        NoReceiver plain = new NoReceiver();
        vm.startPrank(issuer);
        nft.mint(address(r), CASE, 2, URL, DOCS);
        nft.mint(address(plain), CASE, 2, URL, DOCS);
        vm.stopPrank();
        assertFalse(r.called());
        assertEq(nft.ownerOf(1), address(r));
        assertEq(nft.ownerOf(2), address(plain));
        assertEq(nft.totalMinted(), 2);
    }

    function test_EventOrderOnMint() public {
        vm.recordLogs();
        _mint();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 3);
        assertEq(logs[0].topics[0], keccak256("Transfer(address,address,uint256)"));
        assertEq(logs[1].topics[0], keccak256("Locked(uint256)"));
        assertEq(logs[2].topics[0], ServiceNotice721.NoticeServed.selector);
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
