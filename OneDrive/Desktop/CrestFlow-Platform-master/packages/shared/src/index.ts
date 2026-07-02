// Database
export { prisma, setPrisma, getPrisma } from './db.js';

// Logger
export { createLogger, logger } from './logger.js';

// Decimal utilities
export {
  Decimal,
  toDecimalString,
  toBasisPoints,
  fromBasisPoints,
  fromMicroUnits,
  toMicroUnits,
  safeDivide,
} from './decimal.js';

// Error types
export {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  PaymentRequiredError,
  ConflictError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
} from './errors.js';

// Queue names
export { QUEUE_NAMES } from './queues.js';
export type { QueueName } from './queues.js';

// Types — API
export type {
  ApiResponse,
  ApiError,
  ApiMeta,
  PaginatedResponse,
  ApiResult,
} from './types/api.types.js';

// Types — Knowledge Layer
export type {
  AssetHolding,
  AssetCategory,
  ProtocolPosition,
  ProtocolName,
  PositionType,
  PriceData,
  TransactionRecord,
} from './types/knowledge.types.js';

// Types — Portfolio
export type {
  SnapshotTrigger,
  AllocationEntry,
  HealthComponents,
  DataQuality,
  LpDecomposition,
} from './types/portfolio.types.js';

// Types — Risk
export type {
  RiskLevel,
  AlertType,
  AlertSeverity,
  AlertStatus,
  RiskScoreComponents,
  LiquidationPosition,
} from './types/risk.types.js';

// Types — Yield
export type {
  OpportunityType,
  SustainabilityTier,
  TvlTrend,
  ILRiskTier,
  IdleTier,
  GoalProfile,
  YieldOpportunity,
  IdleCapitalSignal,
} from './types/yield.types.js';

// Types — Strategy
export type {
  ModelType,
  RebalanceUrgency,
  RebalancingAction,
  StrategyExplanation,
} from './types/strategy.types.js';

// Types — Execution
export type {
  ActionType,
  ExecutionStatus,
  PolicyDecision,
  POAStep,
  PlanOfAction,
  PolicyResult,
} from './types/execution.types.js';

// Types — User
export type {
  InvestorPersona,
  BehavioralSignalType,
  CopilotIntent,
  ConfidenceLevel,
  CopilotResponse,
  CopilotDataPoint,
  DriftSignal,
} from './types/user.types.js';
