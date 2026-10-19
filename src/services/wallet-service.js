import { getAddress, isAddress } from 'ethers';
import { AppError } from '../utils/app-error.js';

export class WalletService {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async setOwnWallet(userId, blockchainAddress) {
    if (!isAddress(blockchainAddress)) {
      throw new AppError(400, 'A valid Ethereum-compatible wallet address is required.', 'INVALID_WALLET_ADDRESS');
    }
    return this.userRepository.updateBlockchainAddress(userId, getAddress(blockchainAddress));
  }
}
