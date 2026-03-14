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

export interface ChatQuotaState {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
  dailyCapReached?: boolean;
  softBlocked?: boolean;
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

export interface AskAiNegotiationPayload {
  merchant: string;
  amount: number;
  tactic: string;
}

export interface AiMemoryFact {
  fact: string;
  category: "goal" | "preference" | "context" | "milestone" | string;
  ts: number;
}

export interface AiMemoryMilestone {
  text: string;
  ts: number;
}

export interface AiMemory {
  facts: AiMemoryFact[];
  milestones: AiMemoryMilestone[];
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

export interface AuditFlag {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
  meta?: Record<string, unknown>;
}

export interface AuditConsistencyInfo {
  gradeCorrected?: boolean;
  originalGrade?: string | null;
  nonCanonicalDashboardCategories?: string[];
  weeklyMoveDollarTotal?: number;
  expectedOperationalSurplus?: number;
  nativeScoreAnchor?: number;
  nativeScoreDelta?: number;
  nativeRiskFlags?: string[];
  scoreAnchoredToNative?: boolean;
  statusCorrected?: boolean;
}

export interface DegradedSafetyState {
  level: "stable" | "caution" | "urgent";
  headline: string;
  summary: string;
}

export interface DegradedAuditInfo {
  isDegraded: boolean;
  narrativeAvailable: boolean;
  reason: string;
  retryAttempted: boolean;
  riskFlags: string[];
  safetyState: DegradedSafetyState;
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
  riskFlags?: string[];
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
  mode: "FULL" | "DEGRADED";
  liquidNetWorth: number | null;
  netWorth: number | null;
  netWorthDelta: string | number | null;
  healthScore: HealthScore | null;
  alertsCard: string[];
  dashboardCard: DashboardCardRow[];
  weeklyMoves: string[];
  investments?: InvestmentsSummary;
  spendingAnalysis?: SpendingAnalysis | null;
  structured: AuditStructuredResponse;
  sections: ParsedAuditSections;
  moveItems: ParsedMoveItem[];
  topMoves?: ParsedMoveItem[];
  categories?: Record<string, unknown>;
  paceData: PaceDataPoint[];
  negotiationTargets: NegotiationTarget[];
  dashboardData: ParsedAuditDashboardData;
  auditFlags?: AuditFlag[];
  consistency?: AuditConsistencyInfo;
  degraded?: DegradedAuditInfo | null;
}

export interface AuditFormDebt {
  id?: string;
  cardId?: string;
  name?: string;
  balance: number | string;
  amount?: number | string;
  apr?: number | string;
  minPayment?: number | string;
  limit?: number | string;
}

export interface AuditFormInvestment {
  id?: string;
  name?: string;
  symbol?: string;
  amount: number | string;
  type?: string;
}

export interface AuditFormData {
  date: string;
  time?: string;
  checking?: number | string;
  savings?: number | string;
  ally?: number | string;
  debts?: AuditFormDebt[];
  investments?: AuditFormInvestment[];
  budgetActuals?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DemoPortfolio {
  cards: Card[];
  bankAccounts: BankAccount[];
  renewals: Renewal[];
}

export interface MoveCheckState {
  [moveText: string]: boolean | undefined;
}

export interface TrendContextEntry {
  week: number | string;
  date: string;
  checking: number | string;
  vault: number | string;
  totalDebt: number | string;
  score: number | null;
  status: string;
}

export interface AuditRecord {
  date: string;
  ts: string;
  form: AuditFormData;
  parsed: ParsedAudit;
  model?: string;
  isTest: boolean;
  isDemoHistory?: boolean;
  moveChecks: MoveCheckState;
  demoPortfolio?: DemoPortfolio;
}

export interface CurrentDebtSnapshotItem {
  name: string;
  balance: number;
  apr: number;
  minPayment: number;
  limit: number;
}

export interface CurrentDebtSnapshot {
  ts: number;
  debts: CurrentDebtSnapshotItem[];
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
  id?: string;
  name: string;
  allocated?: number;
  group?: string;
  monthlyTarget?: number;
  icon?: string;
}

export interface SavingsGoal {
  id?: string;
  name?: string;
  target?: number;
  saved?: number;
  targetAmount?: number;
  currentAmount?: number;
  targetDate?: string;
}

export interface NonCardDebt {
  id?: string;
  name: string;
  balance: number;
  minPayment: number;
  apr: number;
  minimum?: number;
  dueDay?: number;
  type?: string;
  linkedAssetId?: string | null;
}

export interface OtherAsset {
  id?: string;
  name?: string;
  value?: number;
  liquid?: boolean;
  linkedDebtId?: string | null;
}

export type PayFrequency = "weekly" | "bi-weekly" | "semi-monthly" | "monthly";
export type Payday =
  | "Sunday"
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday";
export type IncomeType = "salary" | "hourly" | "variable";
export type HousingType = "" | "rent" | "own";
export type PaycheckDepositAccount = "checking" | "savings";
export type InvestmentBucket = "roth" | "k401" | "brokerage" | "crypto" | "hsa";

export interface InvestmentHolding {
  symbol: string;
  shares: number | string;
  lastKnownPrice?: number;
}

export interface InvestmentHoldings {
  roth?: InvestmentHolding[];
  k401?: InvestmentHolding[];
  brokerage?: InvestmentHolding[];
  crypto?: InvestmentHolding[];
  hsa?: InvestmentHolding[];
}

export interface InsuranceDeductible {
  name: string;
  amount: number;
}

export interface BigTicketItem {
  name: string;
  cost: number;
  targetDate?: string;
}

export interface Card {
  id: string;
  institution: string;
  name: string;
  nickname?: string;
  issuer?: string;
  limit?: number | null;
  creditLimit?: number | null;
  balance?: number | string | null;
  mask?: string | null;
  last4?: string | null;
  annualFee?: number | string | null;
  annualFeeDue?: string;
  annualFeeWaived?: boolean;
  notes?: string;
  apr?: number | null;
  hasPromoApr?: boolean;
  promoAprAmount?: number | null;
  promoAprExp?: string;
  statementCloseDay?: number | null;
  paymentDueDay?: number | null;
  minPayment?: number | null;
  type?: string;
  cardType?: string;
  dueDay?: number;
  _plaidLimit?: number | null;
  _plaidAccountId?: string;
  _plaidConnectionId?: string;
  _plaidBalance?: number | null;
  _plaidAvailable?: number | null;
}

export interface BankAccount {
  id: string;
  bank: string;
  accountType: "checking" | "savings" | string;
  name: string;
  balance?: number | string | null;
  apy?: number | null;
  notes?: string;
  _plaidAccountId?: string;
  _plaidConnectionId?: string;
  _plaidBalance?: number | null;
  _plaidAvailable?: number | null;
}

export interface Renewal {
  id?: string;
  linkedCardId?: string;
  linkedCardAF?: string;
  cardName?: string;
  name: string;
  amount: number;
  interval: number;
  intervalUnit: string;
  cadence?: string;
  source?: string;
  chargedTo?: string;
  chargedToId?: string;
  nextDue?: string;
  category?: string;
  isCardAF?: boolean;
  isAnnualFee?: boolean;
  isWaived?: boolean;
  isCancelled?: boolean;
  cancelledAt?: string;
  archivedAt?: string;
  originalIndex?: number;
  isExpired?: boolean;
}

export interface PlaidInvestmentAccount {
  id: string;
  institution: string;
  name: string;
  bucket: InvestmentBucket;
  _plaidBalance: number;
  _plaidAccountId: string;
  _plaidConnectionId: string;
}

export interface CustomValuations {
  [rewardCurrency: string]: number | undefined;
}

export interface IssuerCatalogEntry {
  personal: string[];
  business: string[];
  discontinued?: string[];
}

export interface IssuerCardCatalog {
  lastUpdated?: string;
  issuers: Record<string, IssuerCatalogEntry>;
}

export interface MarketPriceQuote {
  price: number;
  [key: string]: unknown;
}

export interface MarketPriceMap {
  [symbol: string]: MarketPriceQuote | undefined;
}

export interface CatalystCashConfigCore {
  payday: Payday;
  paycheckTime: string;
  paycheckStandard: number;
  paycheckFirstOfMonth: number;
  payFrequency: PayFrequency;
  weeklySpendAllowance: number;
  emergencyFloor: number;
  checkingBuffer: number;
  heavyHorizonStart: number;
  heavyHorizonEnd: number;
  heavyHorizonThreshold: number;
  greenStatusTarget: number;
  emergencyReserveTarget: number;
  habitName: string;
  habitRestockCost: number;
  habitCheckThreshold: number;
  habitCriticalThreshold: number;
  trackHabits: boolean;
  defaultAPR: number;
  arbitrageTargetAPR: number;
  fireExpectedReturnPct: number;
  fireInflationPct: number;
  fireSafeWithdrawalPct: number;
  investmentBrokerage: number;
  investmentRoth: number;
  investmentsAsOfDate: string;
  trackRothContributions: boolean;
  rothContributedYTD: number;
  rothAnnualLimit: number;
  autoTrackRothYTD: boolean;
  track401k: boolean;
  k401Balance: number;
  k401ContributedYTD: number;
  k401AnnualLimit: number;
  autoTrack401kYTD: boolean;
  k401EmployerMatchPct: number;
  k401EmployerMatchLimit: number;
  k401VestingPct: number;
  k401StockPct: number;
  overrideBrokerageValue: boolean;
  overrideRothValue: boolean;
  override401kValue: boolean;
  trackHSA: boolean;
  hsaBalance: number;
  hsaContributedYTD: number;
  hsaAnnualLimit: number;
  overrideHSAValue: boolean;
  paydayReminderEnabled: boolean;
  trackBrokerage: boolean;
  trackRoth: boolean;
  brokerageStockPct: number;
  rothStockPct: number;
  budgetCategories: BudgetCategory[];
  savingsGoals: SavingsGoal[];
  nonCardDebts: NonCardDebt[];
  incomeSources: IncomeSource[];
  creditScore: number | null;
  creditScoreDate: string;
  creditUtilization: number | null;
  taxWithholdingRate: number;
  quarterlyTaxEstimate: number;
  isContractor: boolean;
  homeEquity: number;
  vehicleValue: number;
  otherAssets: OtherAsset[];
  otherAssetsLabel: string;
  insuranceDeductibles: InsuranceDeductible[];
  bigTicketItems: BigTicketItem[];
  plaidInvestments: PlaidInvestmentAccount[];
  customValuations: CustomValuations;
  currencyCode: string;
  stateCode: string;
  birthYear: number | null;
  housingType: HousingType;
  monthlyRent: number;
  mortgagePayment: number;
}

export interface CatalystCashConfig extends CatalystCashConfigCore {
  incomeType?: IncomeType;
  hourlyRateNet?: number;
  typicalHours?: number;
  averagePaycheck?: number;
  paycheckDepositAccount?: PaycheckDepositAccount;
  taxBracketPercent?: number;
  trackCrypto?: boolean;
  trackChecking?: boolean;
  trackSavings?: boolean;
  checkingBalance?: number;
  vaultBalance?: number;
  holdings?: InvestmentHoldings;
  enableHoldings?: boolean;
  _fromSetupWizard?: boolean;
}

export type FinancialConfig = CatalystCashConfig;

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
