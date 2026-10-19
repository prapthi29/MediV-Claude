import { getAddress, isAddress } from 'ethers';
import { AppError } from '../utils/app-error.js';
import { SIGNING_ROLES } from './signing-key-service.js';

export class WalletService {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async setOwnWallet(userId, blockchainAddress) {
    const user = await this.userRepository.findById(userId);
    if (SIGNING_ROLES.includes(user?.role)) {
      throw new AppError(403, 'Doctor and pharmacy addresses come from their MediVault signing key and cannot be changed.', 'WALLET_MANAGED');
    }
    if (!isAddress(blockchainAddress)) {
      throw new AppError(400, 'A valid Ethereum-compatible wallet address is required.', 'INVALID_WALLET_ADDRESS');
    }
    return this.userRepository.updateBlockchainAddress(userId, getAddress(blockchainAddress));
  }
}
