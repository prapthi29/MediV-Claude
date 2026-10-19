
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MediVaultRecordRegistry
/// @notice Stores integrity hashes and non-sensitive metadata only.
/// Medical documents and clinical details must remain off-chain.
contract MediVaultRecordRegistry {
    struct Record {
        bytes32 contentHash;
        address patient;
        address registrar;
        uint256 registeredAt;
        bool exists;
    }

    struct RecordVersion {
        bytes32 contentHash;
        address registrar;
        uint256 registeredAt;
    }

    address public owner;

    mapping(bytes32 => Record) private records;
    mapping(bytes32 => uint256) public versionCount;
    mapping(bytes32 => mapping(uint256 => RecordVersion)) private recordVersions;
    mapping(address => mapping(address => uint256)) private accessExpiries;

    error Unauthorized();
    error ZeroAddress();
    error ZeroValue();
    error RecordAlreadyRegistered(bytes32 recordId);
    error RecordNotFound(bytes32 recordId);
    error InvalidExpiry();
    error InvalidVersion(uint256 requested, uint256 current);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    event RecordRegistered(
        bytes32 indexed recordId,
        bytes32 indexed contentHash,
        address indexed patient,
        address registrar,
        uint256 timestamp
    );

    event RecordVersionRegistered(
        bytes32 indexed recordId,
        uint256 indexed version,
        bytes32 indexed contentHash,
        address registrar,
        uint256 timestamp
    );

    event AccessGranted(
        address indexed patient,
        address indexed doctor,
        uint256 expiresAt,
        address indexed grantedBy,
        uint256 timestamp
    );

    event AccessRevoked(
        address indexed patient,
        address indexed doctor,
        address indexed revokedBy,
        uint256 timestamp
    );

    event AuditEvent(
        bytes32 indexed eventId,
        bytes32 indexed eventType,
        address indexed subject,
        address actor,
        uint256 expiresAt,
        uint256 timestamp
    );

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    /// @notice Register the initial version of a record.
    /// @dev The record ID must be an opaque identifier, not a patient identifier.
    function registerRecord(
        bytes32 recordId,
        bytes32 contentHash,
        address patient
    ) external onlyOwner {
        if (recordId == bytes32(0) || contentHash == bytes32(0)) {
            revert ZeroValue();
        }
        if (patient == address(0)) revert ZeroAddress();
        if (records[recordId].exists) {
            revert RecordAlreadyRegistered(recordId);
        }

        records[recordId] = Record({
            contentHash: contentHash,
            patient: patient,
            registrar: msg.sender,
            registeredAt: block.timestamp,
            exists: true
        });

        versionCount[recordId] = 1;

        recordVersions[recordId][1] = RecordVersion({
            contentHash: contentHash,
            registrar: msg.sender,
            registeredAt: block.timestamp
        });

        emit RecordRegistered(
            recordId,
            contentHash,
            patient,
            msg.sender,
            block.timestamp
        );

        emit RecordVersionRegistered(
            recordId,
            1,
            contentHash,
            msg.sender,
            block.timestamp
        );
    }

    /// @notice Append a new version without deleting historical hashes.
    /// @dev The expected version prevents stale updates from overwriting newer versions.
    function registerRecordVersion(
        bytes32 recordId,
        uint256 expectedCurrentVersion,
        bytes32 contentHash
    ) external onlyOwner {
        if (contentHash == bytes32(0)) revert ZeroValue();

        Record storage record = records[recordId];
        if (!record.exists) revert RecordNotFound(recordId);

        uint256 currentVersion = versionCount[recordId];

        if (expectedCurrentVersion != currentVersion) {
            revert InvalidVersion(expectedCurrentVersion, currentVersion);
        }

        uint256 newVersion = currentVersion + 1;

        versionCount[recordId] = newVersion;

        recordVersions[recordId][newVersion] = RecordVersion({
            contentHash: contentHash,
            registrar: msg.sender,
            registeredAt: block.timestamp
        });

        // Maintain compatibility: legacy reads now return the latest version.
        record.contentHash = contentHash;
        record.registrar = msg.sender;
        record.registeredAt = block.timestamp;

        emit RecordVersionRegistered(
            recordId,
            newVersion,
            contentHash,
            msg.sender,
            block.timestamp
        );
    }

    /// @notice Verify the latest registered version.
    function verifyRecord(
        bytes32 recordId,
        bytes32 contentHash
    ) external view returns (bool) {
        Record storage record = records[recordId];

        return record.exists && record.contentHash == contentHash;
    }

    /// @notice Verify a specific historical version.
    function verifyRecordVersion(
        bytes32 recordId,
        uint256 version,
        bytes32 contentHash
    ) external view returns (bool) {
        if (version == 0 || version > versionCount[recordId]) {
            return false;
        }

        return recordVersions[recordId][version].contentHash == contentHash;
    }

    /// @notice Read the latest version using the original interface.
    function getRecord(
        bytes32 recordId
    )
        external
        view
        returns (
            bytes32 contentHash,
            address patient,
            address registrar,
            uint256 registeredAt
        )
    {
        Record storage record = records[recordId];

        if (!record.exists) revert RecordNotFound(recordId);

        return (
            record.contentHash,
            record.patient,
            record.registrar,
            record.registeredAt
        );
    }

    /// @notice Read the hash and metadata for a specific version.
    function getRecordVersion(
        bytes32 recordId,
        uint256 version
    )
        external
        view
        returns (
            bytes32 contentHash,
            address registrar,
            uint256 registeredAt
        )
    {
        if (!records[recordId].exists) {
            revert RecordNotFound(recordId);
        }

        uint256 currentVersion = versionCount[recordId];

        if (version == 0 || version > currentVersion) {
            revert InvalidVersion(version, currentVersion);
        }

        RecordVersion storage item = recordVersions[recordId][version];

        return (
            item.contentHash,
            item.registrar,
            item.registeredAt
        );
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();

        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Mirror application-authorized patient consent.
    function grantAccess(
        address patient,
        address doctor,
        uint256 expiresAt
    ) external onlyOwner {
        if (patient == address(0) || doctor == address(0)) {
            revert ZeroAddress();
        }

        if (expiresAt <= block.timestamp) revert InvalidExpiry();

        accessExpiries[patient][doctor] = expiresAt;

        emit AccessGranted(
            patient,
            doctor,
            expiresAt,
            msg.sender,
            block.timestamp
        );
    }

    function revokeAccess(
        address patient,
        address doctor
    ) external onlyOwner {
        if (patient == address(0) || doctor == address(0)) {
            revert ZeroAddress();
        }

        accessExpiries[patient][doctor] = 0;

        emit AccessRevoked(
            patient,
            doctor,
            msg.sender,
            block.timestamp
        );
    }

    function hasAccess(
        address patient,
        address doctor
    ) external view returns (bool) {
        return accessExpiries[patient][doctor] > block.timestamp;
    }

    function accessExpiry(
        address patient,
        address doctor
    ) external view returns (uint256) {
        return accessExpiries[patient][doctor];
    }

    /// @notice Anchor a non-sensitive audit event.
    function recordAuditEvent(
        bytes32 eventId,
        bytes32 eventType,
        address subject,
        address actor,
        uint256 expiresAt
    ) external onlyOwner {
        if (
            eventId == bytes32(0) ||
            eventType == bytes32(0) ||
            subject == address(0) ||
            actor == address(0)
        ) {
            revert ZeroValue();
        }

        emit AuditEvent(
            eventId,
            eventType,
            subject,
            actor,
            expiresAt,
            block.timestamp
        );
    }
}
