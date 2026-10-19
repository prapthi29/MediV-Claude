
import crypto from 'node:crypto';

export class AuditService {
  constructor({
    auditRepository,
    userRepository,
    recordRegistryClient
  }) {
    this.auditRepository = auditRepository;
    this.userRepository = userRepository;
    this.recordRegistryClient = recordRegistryClient;
  }

  async record({
    eventType,
    actorUserId,
    subjectUserId,
    resourceType,
    resourceId,
    metadata,
    expiresAt
  }) {
    let blockchainTxHash = null;

    const [actor, subject] = await Promise.all([
      actorUserId
        ? this.userRepository.findById(actorUserId)
        : null,
      subjectUserId
        ? this.userRepository.findById(subjectUserId)
        : null
    ]);

    console.log('[Blockchain audit anchor check]', {
      eventType,
      actorFound: Boolean(actor),
      subjectFound: Boolean(subject),
      actorHasBlockchainAddress: Boolean(
        actor?.blockchain_address
      ),
      subjectHasBlockchainAddress: Boolean(
        subject?.blockchain_address
      ),
      hasRecordRegistryClient: Boolean(
        this.recordRegistryClient
      )
    });

    if (
      actor?.blockchain_address &&
      subject?.blockchain_address &&
      this.recordRegistryClient
    ) {
      try {
        console.log(
          '[Blockchain audit anchor] Submitting:',
          eventType
        );

        blockchainTxHash =
          await this.recordRegistryClient.recordAuditEvent({
            eventId: crypto.randomUUID(),
            eventType,
            subjectAddress: subject.blockchain_address,
            actorAddress: actor.blockchain_address,
            expiresAt
          });

        console.log('[Blockchain audit anchor] Result:', {
          eventType,
          hasTransactionHash: Boolean(blockchainTxHash),
          transactionHash: blockchainTxHash
        });

        if (
          typeof blockchainTxHash !== 'string' ||
          !/^0x[a-fA-F0-9]{64}$/.test(blockchainTxHash)
        ) {
          console.error(
            '[Blockchain audit anchor] Invalid transaction hash returned:',
            blockchainTxHash
          );

          blockchainTxHash = null;
        }
      } catch (error) {
        console.error(
          '[Blockchain audit anchor failed]',
          error?.shortMessage ||
            error?.message ||
            error
        );
      }
    } else {
      console.warn(
        '[Blockchain audit anchor skipped]',
        { eventType }
      );
    }

    return this.auditRepository.create({
      eventType,
      actorUserId,
      subjectUserId,
      resourceType,
      resourceId,
      metadata,
      blockchainTxHash
    });
  }
}
