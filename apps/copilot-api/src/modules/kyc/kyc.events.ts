/**
 * KYC & Identity domain events.
 */

export const KYCEvents = {
  KYC_INITIATED: 'KYCInitiated',
  KYC_APPROVED: 'KYCApproved',
  KYC_DECLINED: 'KYCDeclined',
  IDENTITY_ISSUED: 'IdentityIssued',
  ONRAMP_COMPLETED: 'OnRampCompleted',
  OFFRAMP_INITIATED: 'OffRampInitiated',
  OFFRAMP_COMPLETED: 'OffRampCompleted',
} as const;
