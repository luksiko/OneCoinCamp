export interface Route {
  id?: string;
  source: 'roadsurfer' | 'movacar' | 'indiecampers' | 'imoova';
  enabled: boolean;
  originCountry: string;
  destinationCountry: string;
  originName?: string;
  originId?: string;
  destinationName?: string;
  destinationId?: string;
  pickupDate?: string;
  returnDate?: string;
}

export interface UserFilters {
  allowed_origin_countries?: string[];
  allowed_destination_countries?: string[];
  max_price?: number | null;
  only_campers?: boolean;
  vehicle_type?: string;
  silent_hours_enabled?: boolean;
  silent_hours_start?: string;
  silent_hours_end?: string;
  min_trip_days?: number | null;
  max_trip_days?: number | null;
  window_days?: number;
}

export interface UserSettings {
  poll_interval_minutes: number;
  telegram_enabled?: boolean;
  timezone?: string;
  [key: string]: any;
}

export interface AppStateData {
  language: string;
  user: {
    id: string;
    role: 'free' | 'premium' | 'admin';
    subscriptionStatus: 'active' | 'inactive' | 'trial' | 'expired';
    subscriptionExpiresAt?: string;
    maxRoutes: number;
    routeCount: number;
  };
  isAdmin: boolean;
  paddleClientToken?: string | null;
  paddlePriceId?: string | null;
  routes: Route[];
  filters: UserFilters;
  settings: UserSettings;
  countries: Array<[string, string]>;
  providers: string[];
  supportedProviders?: string[];
  status?: {
    intervalMinutes: number;
    lastRun?: {
      timestamp?: string;
      finished_at?: string;
      offers_found?: number;
      error?: string;
      status?: string;
    };
    freshness?: {
      isStale: boolean;
      ageMinutes: number | null;
      thresholdMinutes: number;
    };
  };
  telegramReady?: boolean;
  telegramWebhookActive?: boolean;
}

export interface Offer {
  offerId: string;
  source: string;
  operator: string;
  vehicle?: string;
  vehicleType?: string;
  origin: string;
  originCountry: string;
  destination: string;
  destinationCountry: string;
  pickupDate: string;
  returnDate: string;
  price: number;
  currency: string;
  bookingUrl: string;
  matches?: boolean;
  timestamp?: string;
  lastSeenAt?: string;
  telegramSentAt?: string;
}

export interface OffersFilterPayload {
  source?: string;
  operator?: string;
  vehicleType?: string;
  sentStatus?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  dateFrom?: string;
  dateTo?: string;
  isMatched?: boolean;
}

export interface OffersResponse {
  offers: Offer[];
  total: number;
  page: number;
  totalPages: number;
  availableSources: string[];
  availableOperators: string[];
}

export interface ProvidersHealth {
  roadsurfer: { ok: boolean; message?: string; count?: number };
  movacar: { ok: boolean; message?: string; count?: number };
  indiecampers: { ok: boolean; message?: string; count?: number };
  imoova: { ok: boolean; message?: string; count?: number };
  telegram: { ok: boolean; message?: string };
}

export interface AnalyticsData {
  dailyCounts: Array<{ date: string; total: number; matched: number }>;
  hourlyPattern: Array<{ hour: number; count: number }>;
  topRoutes: Array<{ route: string; count: number }>;
  bySources: Array<{ source: string; total: number; matched: number }>;
}

export interface AdminUser {
  telegram_id: string;
  username?: string;
  first_name?: string;
  role: 'free' | 'premium' | 'admin';
  subscription_status: string;
  subscription_expires_at?: string;
  created_at?: string;
  last_active_at?: string;
  route_count?: number;
  payment_count?: number;
}

export interface AdminPayment {
  id: number;
  telegram_id: string;
  username?: string;
  first_name?: string;
  paddle_transaction_id?: string;
  amount: number;
  currency: string;
  status: string;
  subscription_days: number;
  created_at: string;
}

export interface AdminPromoCode {
  code: string;
  days: number;
  max_uses: number;
  used_count: number;
  expires_at?: string | null;
  created_at?: string;
}

export interface AdminRunLog {
  id: number;
  started_at: string;
  completed_at?: string;
  total_offers: number;
  new_offers: number;
  alerts_sent: number;
  status: string;
  error_message?: string;
}
