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
  payment_info: string;
  invoice_terms_days: number;
  next_invoice_number: number;
  dnd_start?: string | null;
  dnd_end?: string | null;
  dnd_note?: string;
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
  user_id?: string | null;
  invited_at?: string | null;
  pin_hash?: string | null;
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
  late_fee_invoice_id?: string | null;
  notes: string;
};

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type InvoiceItem = { description: string; qty: number; rate: number };

export type Invoice = {
  id: string;
  family_id: string;
  contact_id: string | null;
  bill_to: string;
  number: string;
  period_start: string;
  period_end: string;
  issue_date: string;
  due_date: string | null;
  items: InvoiceItem[];
  share: number;
  total: number;
  status: "open" | "void";
  notes: string;
};

export type Payment = {
  id: string;
  family_id: string;
  invoice_id: string | null;
  paid_by: string;
  amount: number;
  paid_on: string;
  method: string;
  reference: string;
};

export type Expense = {
  id: string;
  spent_on: string;
  amount: number;
  category: string;
  vendor: string;
  note: string;
  home_expense: boolean;
  business_pct: number;
  receipt_path: string | null;
};

export type TimeSpace = { year: number; extra_hours: number; total_sqft: number; daycare_sqft: number };

export type DocumentRow = {
  id: string;
  child_id: string | null;
  title: string;
  kind: string;
  expires_on: string | null;
  file_path: string | null;
  notes: string;
};

export type EntryKind = "meal" | "bottle" | "diaper" | "potty" | "nap" | "mood" | "activity" | "note";

export type DailyEntry = {
  id: string;
  child_id: string;
  care_date: string;
  kind: EntryKind;
  started_at: string;
  ended_at: string | null;
  value: string;
  note: string;
};

export type Supply = { id: string; child_id: string; item: string; level: "plenty" | "low" | "out"; updated_at: string };

export type Incident = {
  id: string;
  child_id: string;
  happened_at: string;
  kind: string;
  location: string;
  description: string;
  action_taken: string;
  witnessed_by: string;
  provider_signature: string | null;
  parent_notified_at: string | null;
  parent_name: string;
  parent_signature: string | null;
};

export type Medication = {
  id: string;
  child_id: string;
  name: string;
  dose: string;
  instructions: string;
  start_date: string;
  end_date: string | null;
  authorized_by: string;
  authorized_signature: string | null;
  active: boolean;
};

export type MedDose = { id: string; medication_id: string; child_id: string; given_at: string; dose: string; given_by: string; note: string };

export type Announcement = { id: string; title: string; body: string; publish_at: string; created_at: string };
export type Photo = { id: string; path: string; caption: string; child_ids: string[]; taken_on: string; created_at: string };
export type Message = { id: string; family_id: string; from_parent: boolean; sender_name: string; body: string; read_at: string | null; created_at: string };
