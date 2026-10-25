// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract CaseFileRegistry {
    uint64 public constant RESPONSE_PERIOD = 30 days;

    struct CaseFile {
        address handler;
        uint8 conditionCount;
        uint8 fulfilledCount;
        uint64 openedAt;
        uint64 serviceDeadline;
        uint64 filedAt;
        uint64 responseDeadline;
        uint64 snapshotAt;
        bytes32 orderHash;
        bytes32 conditionsHash;
        bytes32 affidavitHash;
        bytes32 activityRootHash;
        uint256 fulfilledMask;
    }

    struct Fulfillment {
        bytes32 evidenceHash;
        bytes32 txRef;
        uint64 fulfilledAt;
    }

    error CaseExists();
    error CaseNotFound();
    error NotHandler();
    error ZeroHash();
    error NoConditions();
    error DeadlineInPast();
    error UnknownCondition();
    error AlreadyFulfilled();
    error ServiceAlreadyRecorded();
    error FiledAtInFuture();
    error FiledAtBeforeOpen();
    error ServiceNotRecorded();
    error ResponsePeriodOpen();
    error SnapshotExists();

    event CaseOpened(
        bytes32 indexed caseId,
        address indexed handler,
        bytes32 orderHash,
        bytes32 conditionsHash,
        uint8 conditionCount,
        uint64 serviceDeadline
    );
    event ConditionFulfilled(
        bytes32 indexed caseId, uint8 indexed conditionId, bytes32 evidenceHash, bytes32 txRef, uint64 fulfilledAt
    );
    event ServiceCompleted(bytes32 indexed caseId, bytes32 affidavitHash, uint64 filedAt, uint64 responseDeadline);
    event ActivitySnapshot(bytes32 indexed caseId, bytes32 activityRootHash, uint64 snapshotAt);

    mapping(bytes32 => CaseFile) private _cases;
    mapping(bytes32 => mapping(uint8 => Fulfillment)) private _fulfillments;

    modifier onlyHandler(bytes32 caseId) {
        address h = _cases[caseId].handler;
        if (h == address(0)) revert CaseNotFound();
        if (h != msg.sender) revert NotHandler();
        _;
    }

    // Registers a case; the caller becomes its only handler.
    function openCase(
        bytes32 caseId,
        bytes32 orderHash,
        bytes32 conditionsHash,
        uint8 conditionCount,
        uint64 serviceDeadline
    ) external {
        if (caseId == bytes32(0) || orderHash == bytes32(0) || conditionsHash == bytes32(0)) revert ZeroHash();
        if (_cases[caseId].handler != address(0)) revert CaseExists();
        if (conditionCount == 0) revert NoConditions();
        if (serviceDeadline <= block.timestamp) revert DeadlineInPast();
        CaseFile storage c = _cases[caseId];
        c.handler = msg.sender;
        c.conditionCount = conditionCount;
        c.openedAt = uint64(block.timestamp);
        c.serviceDeadline = serviceDeadline;
        c.orderHash = orderHash;
        c.conditionsHash = conditionsHash;
        emit CaseOpened(caseId, msg.sender, orderHash, conditionsHash, conditionCount, serviceDeadline);
    }

    // Records evidence for one condition (0-based id), once.
    function fulfill(bytes32 caseId, uint8 conditionId, bytes32 evidenceHash, bytes32 txRef)
        external
        onlyHandler(caseId)
    {
        CaseFile storage c = _cases[caseId];
        if (conditionId >= c.conditionCount) revert UnknownCondition();
        uint256 bit = uint256(1) << conditionId;
        if (c.fulfilledMask & bit != 0) revert AlreadyFulfilled();
        if (evidenceHash == bytes32(0)) revert ZeroHash();
        c.fulfilledMask |= bit;
        c.fulfilledCount += 1;
        _fulfillments[caseId][conditionId] = Fulfillment(evidenceHash, txRef, uint64(block.timestamp));
        emit ConditionFulfilled(caseId, conditionId, evidenceHash, txRef, uint64(block.timestamp));
    }

    // Records affidavit filing and derives the response deadline as filedAt + 30 days.
    function recordServiceComplete(bytes32 caseId, bytes32 affidavitHash, uint64 filedAt)
        external
        onlyHandler(caseId)
    {
        CaseFile storage c = _cases[caseId];
        if (c.filedAt != 0) revert ServiceAlreadyRecorded();
        if (affidavitHash == bytes32(0)) revert ZeroHash();
        if (filedAt > block.timestamp) revert FiledAtInFuture();
        if (filedAt < c.openedAt) revert FiledAtBeforeOpen();
        uint64 deadline = filedAt + RESPONSE_PERIOD;
        c.affidavitHash = affidavitHash;
        c.filedAt = filedAt;
        c.responseDeadline = deadline;
        emit ServiceCompleted(caseId, affidavitHash, filedAt, deadline);
    }

    // Anchors the wallet activity root once the response deadline has passed.
    function snapshot(bytes32 caseId, bytes32 activityRootHash) external onlyHandler(caseId) {
        CaseFile storage c = _cases[caseId];
        if (c.filedAt == 0) revert ServiceNotRecorded();
        if (block.timestamp <= c.responseDeadline) revert ResponsePeriodOpen();
        if (c.snapshotAt != 0) revert SnapshotExists();
        if (activityRootHash == bytes32(0)) revert ZeroHash();
        c.activityRootHash = activityRootHash;
        c.snapshotAt = uint64(block.timestamp);
        emit ActivitySnapshot(caseId, activityRootHash, uint64(block.timestamp));
    }

    // Returns the full case record.
    function getCase(bytes32 caseId) external view returns (CaseFile memory) {
        if (_cases[caseId].handler == address(0)) revert CaseNotFound();
        return _cases[caseId];
    }

    // Returns the fulfillment record for a condition (zeroed if pending).
    function getFulfillment(bytes32 caseId, uint8 conditionId) external view returns (Fulfillment memory) {
        return _fulfillments[caseId][conditionId];
    }

    // True if the condition has recorded evidence.
    function isFulfilled(bytes32 caseId, uint8 conditionId) external view returns (bool) {
        return _cases[caseId].fulfilledMask & (uint256(1) << conditionId) != 0;
    }

    // True when every registered condition has evidence.
    function allFulfilled(bytes32 caseId) external view returns (bool) {
        CaseFile storage c = _cases[caseId];
        return c.handler != address(0) && c.fulfilledCount == c.conditionCount;
    }

    // True once the response deadline has passed.
    function responsePeriodExpired(bytes32 caseId) external view returns (bool) {
        CaseFile storage c = _cases[caseId];
        return c.filedAt != 0 && block.timestamp > c.responseDeadline;
    }
}
