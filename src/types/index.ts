export type BackendProvider = "openai" | "gemini" | "backend";
export type ResponseFormat = "json" | "text";
export type SubscriptionTier = "free" | "pro";
export type AuditStatus = "GREEN" | "YELLOW" | "RED" | "UNKNOWN" | string;
export type HealthTrend = "up" | "down" | "flat" | string;
export type GatingMode = "soft" | "live" | string;
export type MerchantCategory =
  | "dining"
  | "groceries"
  | "gas"
  | "travel"
  | "transit"
  | "online_shopping"
  | "wholesale_clubs"
  | "streaming"
  | "drugstores"
  | "catch-all";

export interface RateLimitUpdate {
  remaining: number;
  limit: number | null;
  isChat: boolean;
}

export interface BackendHeaders {
  "Content-Type": "application/json";
  "X-Device-ID": string;
  "X-App-Version": string;
  "X-Subscription-Tier": SubscriptionTier;
  "X-RC-App-User-ID"?: string;
}

export interface ChatHistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
  ts?: number;
}

export interface GeminiHistoryPart {
  text: string;
}

export interface GeminiHistoryMessage {
  role: "user" | "model";
  parts: [GeminiHistoryPart, ...GeminiHistoryPart[]];
}

export interface AuditRequestBody {
  snapshot: string;
  systemPrompt: string;
  history: ChatHistoryMessage[] | GeminiHistoryMessage[];
  model: string;
  stream: boolean;
  provider: Exclude<BackendProvider, "backend">;
  responseFormat: ResponseFormat;
}

export interface AuditErrorResponse {
  error?: string;
}

export interface AuditSuccessResponse {
  result?: string | AuditStructuredResponse;
}

export interface HeaderCard {
  status: AuditStatus;
  details?: string[];
  headline?: string;
}

export interface HealthScore {
  score: number;
  grade: string;
  trend: HealthTrend;
  summary: string;
  narrative?: string;
}

export interface DashboardCardRow {
  category: string;
  amount: string;
  status: string;
}

export interface RadarItem {
  item: string;
  amount: string;
  date: string;
}

export interface SpendingCategoryBreakdown {
  category: string;
  amount: string;
  pctOfTotal: string;
}

export interface SpendingAnalysis {
  totalSpent: string;
  dailyAverage: string;
  vsAllowance: string;
  topCategories: SpendingCategoryBreakdown[];
  alerts: string[];
  debtImpact: string;
}

export interface NegotiationTarget {
  target: string;
  strategy: string;
  estimatedAnnualSavings: number;
}

export interface InvestmentsSummary {
  balance: string;
  asOf: string;
  gateStatus: string;
  cryptoValue?: string | null;
  netWorth?: string;
}

export interface PaceDataPoint {
  category: string;
  amount: string;
  pctOfTotal: string;
}

export interface AuditStructuredResponse {
  ensembleThoughtProcess?: string;
  headerCard: HeaderCard;
  liquidNetWorth?: string;
  netWorth?: string | number | null;
  netWorthDelta?: string | number | null;
  healthScore: HealthScore | null;
  alertsCard: string[];
  dashboardCard: DashboardCardRow[];
  weeklyMoves: string[];
  radar?: RadarItem[];
  longRangeRadar: RadarItem[];
  milestones: string[];
  investments?: InvestmentsSummary;
  nextAction: string;
  spendingAnalysis?: SpendingAnalysis | null;
  negotiationTargets: NegotiationTarget[];
  paceData?: PaceDataPoint[];
  rotatingCategories?: string[];
  [key: string]: unknown;
}

export interface ParsedAuditSections {
  header: string;
  alerts: string;
  dashboard: string;
  moves: string;
  radar: string;
  longRange: string;
  forwardRadar: string;
  investments: string;
  nextAction: string;
  autoUpdates: string;
  qualityScore: string;
}

export interface ParsedMoveItem {
  tag: string | null;
  text: string;
  done: boolean;
}

export interface ParsedAuditDashboardData {
  checkingBalance: number | null;
  savingsVaultTotal: number | null;
}

export interface ParsedAudit {
  raw: string;
  status: AuditStatus;
  mode: "FULL";
  netWorth: number | null;
  netWorthDelta: string | number | null;
  healthScore: HealthScore | null;
  structured: AuditStructuredResponse;
  sections: ParsedAuditSections;
  moveItems: ParsedMoveItem[];
  paceData: PaceDataPoint[];
  negotiationTargets: NegotiationTarget[];
  dashboardData: ParsedAuditDashboardData;
}

export interface DashboardMetrics {
  checking: number | null;
  vault: number | null;
  investments?: number | null;
  otherAssets?: number | null;
  pending: number | null;
  debts: number | null;
  available: number | null;
}

export interface MerchantCategoryResponse {
  category: MerchantCategory;
}

export type BatchMerchantCategoryResponse = Record<string, MerchantCategory | string>;

export interface RemoteConfigResponse {
  gatingMode?: GatingMode;
  minVersion?: string;
  rotatingCategories?: string[];
}

export interface RemoteGatingConfig {
  gatingMode: GatingMode;
  minVersion: string;
}

export interface EncryptedBackupEnvelope {
  v: 1;
  salt: string;
  iv: string;
  ct: string;
}

export interface AtRestEncryptedPayload {
  v: 2;
  iv: string;
  ct: string;
}

export interface IncomeSource {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  type: string;
  nextDate: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  allocated: number;
  group: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  saved: number;
}

export interface NonCardDebt {
  id: string;
  name: string;
  balance: number;
  minPayment: number;
  apr: number;
}

export interface OtherAsset {
  id: string;
  name: string;
  value: number;
}

export type FinancialConfigScalar = string | number | boolean | null;

export type FinancialConfigValue =
  | FinancialConfigScalar
  | IncomeSource[]
  | BudgetCategory[]
  | SavingsGoal[]
  | NonCardDebt[]
  | OtherAsset[];

export interface FinancialConfig {
  incomeSources?: IncomeSource[];
  budgetCategories?: BudgetCategory[];
  savingsGoals?: SavingsGoal[];
  nonCardDebts?: NonCardDebt[];
  otherAssets?: OtherAsset[];
  _fromSetupWizard?: boolean;
  [key: string]: FinancialConfigValue | undefined;
}

export interface SanitizedPlaidAccount {
  plaidAccountId: string;
  name: string;
  officialName: string;
  type: string;
  subtype: string;
  mask: string;
  linkedCardId: string | null;
  linkedBankAccountId: string | null;
  linkedInvestmentId: string | null;
  balance: null;
}

export interface SanitizedPlaidConnection {
  id: string;
  institutionName: string;
  institutionId: string;
  accounts: SanitizedPlaidAccount[];
  lastSync: null;
  _needsReconnect: true;
}

export type BackupDataValue =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[];

export interface BackupData {
  "personal-rules"?: string;
  "plaid-connections-sanitized"?: SanitizedPlaidConnection[];
  [key: string]: BackupDataValue | undefined;
}

export interface BackupPayload {
  app: "Catalyst Cash" | "FinAudit Pro";
  version: string;
  exportedAt: string;
  data: BackupData;
}

export interface SpreadsheetBackupPayload {
  type: "spreadsheet-backup";
  base64: string;
}

export interface BackupImportResult {
  count: number;
  exportedAt: string;
}
