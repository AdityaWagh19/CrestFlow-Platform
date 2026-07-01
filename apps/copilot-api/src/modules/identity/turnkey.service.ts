import { Turnkey } from '@turnkey/sdk-server';
import algosdk from 'algosdk';
import { config } from '../../config/env.js';
import { createLogger, AppError } from '@crestflow/shared';

const logger = createLogger('turnkey');

const turnkey = new Turnkey({
  apiBaseUrl: config.TURNKEY_API_BASE_URL,
  apiPublicKey: config.TURNKEY_API_PUBLIC_KEY,
  apiPrivateKey: config.TURNKEY_API_PRIVATE_KEY,
  defaultOrganizationId: config.TURNKEY_ORGANIZATION_ID,
});

export interface TurnkeyWalletResult {
  subOrgId: string;
  walletId: string;
  algorandAddress: string;
}

/**
 * Create a Turnkey sub-organization with an embedded Algorand wallet.
 * Each CrestFlow user gets their own isolated sub-org (key vault).
 *
 * Uses Ed25519 curve with BIP32 derivation path m/44'/283'/0'/0/0 (SLIP-44 Algorand).
 */
export async function createSubOrgWithWallet(
  userEmail: string,
  userName: string | null,
): Promise<TurnkeyWalletResult> {
  try {
    const apiClient = turnkey.apiClient();

    // SDK v6: fields are top-level in the body (no `parameters` wrapper)
    const result = await apiClient.createSubOrganization({
      organizationId: config.TURNKEY_ORGANIZATION_ID,
      subOrganizationName: `crestflow-user-${userEmail}`,
      rootUsers: [
        {
          userName: userName ?? userEmail,
          userEmail: userEmail,
          apiKeys: [],
          authenticators: [],
          oauthProviders: [],
        },
      ],
      rootQuorumThreshold: 1,
      wallet: {
        walletName: 'Algorand Primary Wallet',
        accounts: [
          {
            curve: 'CURVE_ED25519',
            pathFormat: 'PATH_FORMAT_BIP32',
            path: "m/44'/283'/0'/0/0",
            addressFormat: 'ADDRESS_FORMAT_UNCOMPRESSED',
          },
        ],
      },
    });

    // SDK v6: subOrganizationId and wallet are top-level response properties
    const subOrgId = result.subOrganizationId;
    const wallet = result.wallet;

    if (!subOrgId || !wallet) {
      throw new Error('Turnkey response missing subOrganizationId or wallet');
    }

    const walletId = wallet.walletId;
    const rawAddress = wallet.addresses[0];

    if (!walletId || !rawAddress) {
      throw new Error('Turnkey response missing walletId or addresses');
    }

    // Derive Algorand base32 address from the Ed25519 public key
    // Turnkey returns the raw hex public key for UNCOMPRESSED format
    const publicKeyBytes = Buffer.from(rawAddress, 'hex');
    const algorandAddress = algosdk.encodeAddress(new Uint8Array(publicKeyBytes));

    logger.info({ subOrgId, walletId }, 'Turnkey sub-org and Algorand wallet created');

    return { subOrgId, walletId, algorandAddress };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err }, 'Turnkey wallet creation failed');
    throw new AppError('Failed to provision embedded wallet', 500, 'WALLET_PROVISION_FAILED');
  }
}
