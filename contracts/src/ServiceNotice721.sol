// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

contract ServiceNotice721 is ERC721, Ownable {
    struct Notice {
        bytes32 caseId;
        uint8 conditionId;
        bytes32 documentsHash;
        uint64 servedAt;
        string documentsUrl;
    }

    error Soulbound();
    error EmptyUrl();
    error InvalidUrlChar();
    error EmptyHash();
    error ZeroRecipient();
    error AlreadyServed();

    event NoticeServed(
        uint256 indexed tokenId,
        bytes32 indexed caseId,
        uint8 indexed conditionId,
        address recipient,
        bytes32 documentsHash,
        string documentsUrl
    );
    event Locked(uint256 tokenId);

    uint256 public totalMinted;
    mapping(uint256 => Notice) private _notices;
    mapping(bytes32 => uint256) public servedToken;

    constructor(address issuer) ERC721("ServeChain Service Notice", "SERVE") Ownable(issuer) {}

    // Key for one service of one condition of one case on one recipient.
    function serviceKey(bytes32 caseId, uint8 conditionId, address to) public pure returns (bytes32) {
        return keccak256(abi.encode(caseId, conditionId, to));
    }

    // Mints a non-transferable notice whose URL and documents hash are fixed forever; one per (case, condition, recipient).
    function mint(address to, bytes32 caseId, uint8 conditionId, string calldata documentsUrl, bytes32 documentsHash)
        external
        onlyOwner
        returns (uint256 tokenId)
    {
        if (to == address(0)) revert ZeroRecipient();
        if (documentsHash == bytes32(0)) revert EmptyHash();
        _checkUrl(bytes(documentsUrl));
        bytes32 key = serviceKey(caseId, conditionId, to);
        if (servedToken[key] != 0) revert AlreadyServed();
        tokenId = ++totalMinted;
        servedToken[key] = tokenId;
        _notices[tokenId] = Notice(caseId, conditionId, documentsHash, uint64(block.timestamp), documentsUrl);
        _mint(to, tokenId);
        emit Locked(tokenId);
        emit NoticeServed(tokenId, caseId, conditionId, to, documentsHash, documentsUrl);
    }

    // Returns the stored notice record for a token.
    function noticeOf(uint256 tokenId) external view returns (Notice memory) {
        _requireOwned(tokenId);
        return _notices[tokenId];
    }

    // ERC-5192: every notice is permanently locked to the served wallet.
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    // Builds on-chain JSON metadata from the fixed notice fields.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Notice storage n = _notices[tokenId];
        string memory hashHex = Strings.toHexString(uint256(n.documentsHash), 32);
        bytes memory json = abi.encodePacked(
            '{"name":"Notice of Lawsuit #',
            Strings.toString(tokenId),
            '","description":"Service documents are posted at external_url. SHA-256 of the document bundle: ',
            hashHex,
            '","external_url":"',
            n.documentsUrl,
            '","attributes":[{"trait_type":"caseId","value":"',
            Strings.toHexString(uint256(n.caseId), 32),
            '"},{"trait_type":"conditionId","value":',
            Strings.toString(n.conditionId),
            '},{"trait_type":"documentsSha256","value":"',
            hashHex,
            '"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    // ERC-165 including the ERC-5192 interface id.
    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId);
    }

    // Blocks approvals since tokens can never move.
    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    // Blocks operator approvals since tokens can never move.
    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    // Allows minting only; any transfer or burn reverts.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    // Accepts printable ASCII only (no space, quote, backslash, DEL or bytes >= 0x80); non-ASCII must be percent-encoded.
    function _checkUrl(bytes memory u) private pure {
        if (u.length == 0) revert EmptyUrl();
        for (uint256 i; i < u.length; ++i) {
            bytes1 c = u[i];
            if (c < 0x21 || c > 0x7e || c == 0x22 || c == 0x5c) revert InvalidUrlChar();
        }
    }
}
