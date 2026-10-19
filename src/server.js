
import { createApp } from './app.js';
import { createDatabase } from './config/database.js';
import { createMedicalStorage } from './config/storage.js';
import { RecordRegistryClient } from './blockchain/record-registry-client.js';
import { MockRecordRegistryClient } from './blockchain/mock-record-registry-client.js';
import { loadEnv } from './config/env.js';

// Repositories
import { UserRepository } from './models/user-repository.js';
import { MedicalRecordRepository } from './models/medical-record-repository.js';
import { ConsentRepository } from './models/consent-repository.js';
import { PrescriptionRepository } from './models/prescription-repository.js';
import { AuditRepository } from './models/audit-repository.js';
import { EmergencyAccessRepository } from './models/emergency-access-repository.js';
import { EmergencyProfileRepository } from './models/emergency-profile-repository.js';
import { RecordAccessRequestRepository } from './models/record-access-request-repository.js';
import { RecordCreationApprovalRepository } from './models/record-creation-approval-repository.js';
import { RecordUpdateApprovalRepository } from './models/record-update-approval-repository.js';
import { MedicalRecordVersionRepository } from './models/medical-record-version-repository.js';
import { EmergencyProfileAccessRequestRepository } from './models/emergency-profile-access-request-repository.js';
import { SigningKeyRepository } from './models/signing-key-repository.js';

// Services
import { AuthService } from './services/auth-service.js';
import { MedicalRecordService } from './services/medical-record-service.js';
import { FileEncryptionService } from './encryption/file-encryption-service.js';
import { WalletService } from './services/wallet-service.js';
import { ConsentService } from './services/consent-service.js';
import { PrescriptionService } from './services/prescription-service.js';
import { AuditService } from './services/audit-service.js';
import { EmergencyAccessService } from './services/emergency-access-service.js';
import { EmergencyProfileService } from './services/emergency-profile-service.js';
import { EmergencyProfileAccessRequestService } from './services/emergency-profile-access-request-service.js';
import { AdminService } from './services/admin-service.js';
import { SigningKeyService } from './services/signing-key-service.js';

const config = loadEnv();
const database = createDatabase(config);

// Repositories
const userRepository = new UserRepository(database);
const medicalRecordRepository = new MedicalRecordRepository(database);
const auditRepository = new AuditRepository(database);

const recordAccessRequestRepository =
  new RecordAccessRequestRepository(database);
const recordCreationApprovalRepository =
  new RecordCreationApprovalRepository(database);
const recordUpdateApprovalRepository = new RecordUpdateApprovalRepository(database);
const medicalRecordVersionRepository = new MedicalRecordVersionRepository(database);

const emergencyProfileAccessRequestRepository =
  new EmergencyProfileAccessRequestRepository(database);

// Authentication and signing keys (the audit service is attached once it exists)
const signingKeyService = new SigningKeyService({
  signingKeyRepository: new SigningKeyRepository(database),
  userRepository
});

const authService = new AuthService({
  userRepository,
  jwtSecret: config.JWT_SECRET,
  jwtExpiresIn: config.JWT_EXPIRES_IN,
  signingKeyService
});

// Blockchain configuration
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const useMockChain =
  config.BLOCKCHAIN_CONTRACT_ADDRESS === ZERO_ADDRESS;

const recordRegistryClient = useMockChain
  ? new MockRecordRegistryClient()
  : new RecordRegistryClient({
      rpcUrl: config.BLOCKCHAIN_RPC_URL,
      chainId: config.BLOCKCHAIN_CHAIN_ID,
      contractAddress: config.BLOCKCHAIN_CONTRACT_ADDRESS,
      privateKey: config.BLOCKCHAIN_PRIVATE_KEY
    });

if (useMockChain) {
  console.log(
    'WARNING: BLOCKCHAIN_CONTRACT_ADDRESS is the zero address. ' +
    'Using MockRecordRegistryClient; no real blockchain calls are made.'
  );
}

// Audit service
const auditService = new AuditService({
  auditRepository,
  userRepository,
  recordRegistryClient
});

signingKeyService.auditService = auditService;

// Consent service
const consentRepository = new ConsentRepository(database);

const consentService = new ConsentService({
  consentRepository,
  userRepository,
  recordRegistryClient,
  auditService
});

// File encryption
const fileEncryptionService = new FileEncryptionService({
  masterKey: Buffer.from(config.FILE_ENCRYPTION_KEY, 'base64')
});

// Medical records
const medicalRecordService = new MedicalRecordService({
  medicalRecordRepository,
  recordAccessRequestRepository,
  recordCreationApprovalRepository,
  recordUpdateApprovalRepository,
  medicalRecordVersionRepository,
  medicalStorage: createMedicalStorage(config),
  fileEncryptionService,
  userRepository,
  recordRegistryClient,
  consentService,
  auditService,
  signingKeyService
});

// Wallets
const walletService = new WalletService({
  userRepository
});

// Prescriptions
const prescriptionService = new PrescriptionService({
  prescriptionRepository: new PrescriptionRepository(database),
  medicalStorage: createMedicalStorage(config),
  fileEncryptionService,
  userRepository,
  consentService,
  recordRegistryClient,
  auditService,
  signingKeyService
});

// Existing emergency/break-glass service: unchanged
const emergencyAccessService = new EmergencyAccessService({
  emergencyAccessRepository: new EmergencyAccessRepository(database),
  userRepository,
  medicalRecordRepository,
  auditService
});

// Emergency profile access requests
const emergencyProfileAccessRequestService =
  new EmergencyProfileAccessRequestService({
    requestRepository: emergencyProfileAccessRequestRepository,
    userRepository,
    consentService,
    auditService
  });

// Emergency medical profiles
const emergencyProfileService = new EmergencyProfileService({
  emergencyProfileRepository: new EmergencyProfileRepository(
    database,
    emergencyProfileAccessRequestRepository
  ),
  userRepository,
  consentService,
  emergencyProfileAccessRequestRepository,
  signingKeyService,
  recordRegistryClient,
  auditService
});

// Administration
const adminService = new AdminService({
  userRepository,
  auditRepository,
  auditService
});

// Express application
const app = createApp({
  authService,
  medicalRecordService,
  walletService,
  consentService,
  prescriptionService,
  emergencyAccessService,
  emergencyProfileService,
  emergencyProfileAccessRequestService,
  auditRepository,
  adminService,
  signingKeyService
});

// Start server
const server = app.listen(config.PORT, () => {
  console.log(`MediVault API listening on port ${config.PORT}`);
});

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down MediVault API...');

  server.close(async () => {
    try {
      await database.close();
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

