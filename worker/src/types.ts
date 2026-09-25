export interface User {
  telegram_id: string;
  chat_id: string;
  username?: string;
  first_name?: string;
  status: string;
  role: 'free' | 'premium' | 'admin';
  subscription_status: 'active' | 'inactive' | 'trial' | 'expired';
  subscription_started_at?: string;
  subscription_expires_at?: string;
  max_routes?: number | null;
  paddle_customer_id?: string;
  paddle_subscription_id?: string;
  language: string;
  created_at?: string;
  last_active_at?: string;
  route_count?: number;
  payment_count?: number;
}

export interface Payment {
  id?: number;
  telegram_id: string;
  username?: string;
  first_name?: string;
  paddle_transaction_id?: string;
  amount: number;
  currency: string;
  status: string;
  subscription_days: number;
  created_at?: string;
}

export interface UserRoute {
  id: string;
  telegram_id: string;
  enabled: boolean;
  source: string;
  origin_name?: string;
  origin_id?: string;
  origin_country?: string;
  destination_name?: string;
  destination_id?: string;
  destination_country?: string;
  pickup_date?: string;
  return_date?: string;
  created_at?: string;
}

export interface UserFilters {
  telegram_id: string;
  allowed_origin_countries: string;
  allowed_destination_countries: string;
  max_price?: number | null;
  only_campers?: boolean;
  vehicle_type?: string;
  silent_hours_enabled?: boolean;
  silent_hours_start?: string;
  silent_hours_end?: string;
  window_days?: number;
  window_start_rule?: string;
  min_duration_days?: number | null;
  max_duration_days?: number | null;
  roadsurfer_origins_per_run?: number;
  updated_at?: string;
}

export interface NormalizedOffer {
  source: string;
  offer_id: string;
  vehicle_id?: string;
  vehicle?: string;
  vehicle_type?: 'camper' | 'car' | 'unknown';
  origin: string;
  origin_country: string;
  destination: string;
  destination_country: string;
  pickup_date: string;
  return_date: string;
  price: number;
  currency: string;
  booking_url: string;
  raw_json?: string;
  fingerprint?: string;
  sleeping_places?: number;
  operator_name?: string;
  is_daily_price?: boolean;
}

export interface RunLog {
  id?: number;
  started_at?: string;
  finished_at?: string;
  source?: string;
  request_count: number;
  offers_found: number;
  archived: number;
  alerts_sent: number;
  status: string;
  error?: string;
}

export interface GlobalSettings {
  poll_interval_minutes: number;
  availability_check_interval_minutes: number;
  window_days: number;
  timezone: string;
  telegram_enabled: boolean;
  provider_roadsurfer_enabled: boolean;
  provider_movacar_enabled: boolean;
  provider_indiecampers_enabled: boolean;
  provider_imoova_enabled: boolean;
  [key: string]: any;
}
