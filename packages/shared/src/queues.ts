/** BullMQ queue name constants — all plans import from here. */
export const QUEUE_NAMES = {
  PORTFOLIO_SCAN: 'crestflow:portfolio-scan',
  RISK_ANALYSIS: 'crestflow:risk-analysis',
  STRATEGY: 'crestflow:strategy',
  YIELD: 'crestflow:yield',
  EXECUTION: 'crestflow:execution',
  AUDIT: 'crestflow:audit',
  MAINTENANCE: 'crestflow:maintenance',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
