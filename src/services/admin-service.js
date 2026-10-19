import { AppError } from '../utils/app-error.js';

export class AdminService {
  constructor({ userRepository, auditRepository, auditService }) {
    this.userRepository = userRepository;
    this.auditRepository = auditRepository;
    this.auditService = auditService;
  }

  // Admins decide on doctor and pharmacy accounts only; patients are outside their reach.
  async requireProfessional(targetUserId) {
    const user = await this.userRepository.findById(targetUserId);
    if (!user || !['doctor', 'pharmacy'].includes(user.role)) {
      throw new AppError(404, 'Doctor or pharmacy account not found.', 'USER_NOT_FOUND');
    }
  }

  async listPendingUsers() {
    return this.userRepository.listPending();
  }

  async listAllUsers() {
    return this.userRepository.listNonPatients();
  }

  async approveUser(adminUserId, targetUserId) {
    await this.requireProfessional(targetUserId);
    const user = await this.userRepository.setStatus(targetUserId, 'active');
    if (!user) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
    await this.auditService?.record({
      eventType: 'user_approved',
      actorUserId: adminUserId,
      subjectUserId: targetUserId,
      resourceType: 'user',
      resourceId: targetUserId,
      metadata: {}
    });
    return user;
  }

  async rejectUser(adminUserId, targetUserId) {
    await this.requireProfessional(targetUserId);
    const user = await this.userRepository.setStatus(targetUserId, 'rejected');
    if (!user) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
    await this.auditService?.record({
      eventType: 'user_rejected',
      actorUserId: adminUserId,
      subjectUserId: targetUserId,
      resourceType: 'user',
      resourceId: targetUserId,
      metadata: {}
    });
    return user;
  }

  async listAllAuditEvents() {
    return this.auditRepository.listAccountEvents();
  }
}
