export type RatioRule = { label: string; max_age_months: number; max_per_adult: number };

export type Provider = {
  id: string;
  email: string | null;
  provider_name: string;
  business_name: string;
  address: string;
  phone: string;
  country: string;
  currency: string;
  time_zone: string;
  open_time: string;
  close_time: string;
  late_grace_minutes: number;
  late_fee_amount: number;
  late_fee_per_minutes: number;
  ratio_rules: RatioRule[];
  max_children: number;
};

export type Family = { id: string; name: string; notes: string; active: boolean };

export type Contact = {
  id: string;
  family_id: string;
  full_name: string;
  relationship: string;
  phone: string;
  email: string;
  is_guardian: boolean;
  can_pickup: boolean;
  billing_share: number;
  photo_path: string | null;
  id_notes: string;
};

export type Child = {
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  schedule_days: string[];
  rate: number;
  rate_type: "hourly" | "daily" | "weekly" | "monthly";
  allergies: string;
  notes: string;
  active: boolean;
};

export type Attendance = {
  id: string;
  child_id: string;
  care_date: string;
  check_in: string | null;
  check_out: string | null;
  in_by: string;
  out_by: string;
  in_signature: string | null;
  out_signature: string | null;
  late_minutes: number;
  late_fee: number;
  notes: string;
};

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
