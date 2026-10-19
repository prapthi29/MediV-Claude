import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';

const schema = z.object({ blockchainAddress: z.string().trim().min(1).max(42) }).strict();

export function createWalletController(walletService) {
  return {
    setOwn: asyncHandler(async (req, res) => {
      const { blockchainAddress } = schema.parse(req.body);
      const user = await walletService.setOwnWallet(req.user.sub, blockchainAddress);
      res.json({ wallet: { blockchainAddress: user.blockchain_address } });
    })
  };
}
