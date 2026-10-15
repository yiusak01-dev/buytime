import { supabase } from '@/integrations/supabase/client';

// Dedicated tables, separate from legacy BuyTime receipts and transactions.
// Their RLS policies are the authoritative permission boundary.
const db = supabase as any;

export type MarketCategory = 'group_buy' | 'coupon' | 'queue' | 'parking';
export type MarketIntent = 'have' | 'need';
export type MarketStatus = 'active' | 'closed' | 'hidden';
export type InterestStatus = 'requested' | 'accepted' | 'declined' | 'cancelled' | 'completed';

export interface MarketMall {
  id: number;
  name: string;
  district: string | null;
  is_active: boolean | null;
  enabled: boolean;
  allowed_categories: MarketCategory[];
}
export interface Opportunity {
  id: string;
  owner_id: string;
  mall_id: number;
  category: MarketCategory;
  intent: MarketIntent;
  title: string;
  merchant_name: string;
  description: string;
  meetup_hint: string;
  issuer_transfer_permitted: boolean;
  status: MarketStatus;
  expires_at: string;
  created_at: string;
}
export interface MarketInterest {
  id: string;
  opportunity_id: string;
  requester_id: string;
  status: InterestStatus;
  created_at: string;
  updated_at: string;
}
export interface MarketMessage {
  id: string;
  interest_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}
export interface MarketReport {
  id: string;
  opportunity_id: string;
  reporter_id: string;
  reason: string;
  status: 'open' | 'reviewed' | 'resolved';
  created_at: string;
}
export interface MarketAmbassador {
  user_id: string;
  assigned_mall_id: number | null;
  display_label: string;
  active: boolean;
}

export const CATEGORY_LABEL: Record<MarketCategory, string> = {
  group_buy: '夾單', coupon: '購物優惠', queue: '食飯候位', parking: '泊車',
};
export const CATEGORY_HELP: Record<MarketCategory, string> = {
  group_buy: '有人想買同一優惠？夾埋一齊更抵。',
  coupon: '付款前，睇吓同場有冇啱用嘅優惠。',
  queue: '只限餐廳明確容許轉讓嘅候位機會。',
  parking: '只限商場明確容許轉讓或共享嘅權益。',
};

export async function currentUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user?.id ?? null;
}
export async function fetchMalls(): Promise<MarketMall[]> {
  const [malls, settings] = await Promise.all([
    db.from('malls').select('id,name,district,is_active').order('name'),
    db.from('market_mall_settings').select('mall_id,enabled,allowed_categories'),
  ]);
  if (malls.error) throw malls.error;
  if (settings.error) throw settings.error;
  const flags = new Map<number, { enabled: boolean; allowed_categories: MarketCategory[] }>(
    (settings.data ?? []).map((s: any) => [Number(s.mall_id), s]),
  );
  return (malls.data ?? []).map((m: any) => ({
    id: Number(m.id), name: String(m.name), district: m.district ?? null,
    is_active: m.is_active ?? true,
    enabled: Boolean(flags.get(Number(m.id))?.enabled),
    allowed_categories: flags.get(Number(m.id))?.allowed_categories ?? ['group_buy', 'coupon'],
  }));
}
export async function fetchLiveOpportunities(mallId: number): Promise<Opportunity[]> {
  const { data, error } = await db.from('market_opportunities').select('*')
    .eq('mall_id', mallId).eq('status', 'active')
    .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as Opportunity[];
}
export async function fetchMyOpportunities(userId: string): Promise<Opportunity[]> {
  const { data, error } = await db.from('market_opportunities').select('*')
    .eq('owner_id', userId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data ?? [];
}
export async function createOpportunity(input: {
  owner_id: string; mall_id: number; category: MarketCategory; intent: MarketIntent;
  title: string; merchant_name: string; description: string;
  meetup_hint: string; expires_at: string; issuer_transfer_permitted: boolean;
}): Promise<Opportunity> {
  const { data, error } = await db.from('market_opportunities')
    .insert({ ...input, status: 'active' }).select('*').single();
  if (error) throw error;
  return data as Opportunity;
}
export async function closeOpportunity(id: string, userId: string) {
  const { error } = await db.from('market_opportunities').update({ status: 'closed' })
    .eq('id', id).eq('owner_id', userId);
  if (error) throw error;
}
export async function fetchInterests(userId: string, ownedIds: string[]): Promise<MarketInterest[]> {
  const ownQuery = db.from('market_interests').select('*').eq('requester_id', userId).limit(100);
  const incomingQuery = ownedIds.length
    ? db.from('market_interests').select('*').in('opportunity_id', ownedIds).limit(100)
    : Promise.resolve({ data: [], error: null });
  const [outgoing, incoming] = await Promise.all([ownQuery, incomingQuery]);
  if (outgoing.error) throw outgoing.error;
  if (incoming.error) throw incoming.error;
  const unique = new Map<string, MarketInterest>();
  for (const i of [...(outgoing.data ?? []), ...(incoming.data ?? [])]) unique.set(i.id, i);
  return [...unique.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export async function sendInterest(opportunityId: string, requesterId: string) {
  const { error } = await db.from('market_interests').insert({
    opportunity_id: opportunityId, requester_id: requesterId, status: 'requested',
  });
  if (error) throw error;
}
export async function transitionInterest(id: string, next: InterestStatus) {
  const { error } = await db.rpc('market_transition_interest', {
    p_interest_id: id, p_target_status: next,
  });
  if (error) throw error;
}
export async function fetchMessages(interestId: string): Promise<MarketMessage[]> {
  const { data, error } = await db.from('market_messages').select('*')
    .eq('interest_id', interestId).order('created_at', { ascending: true }).limit(200);
  if (error) throw error;
  return data ?? [];
}
export async function sendMessage(interestId: string, userId: string, body: string) {
  const { error } = await db.from('market_messages').insert({
    interest_id: interestId, sender_id: userId, body: body.trim(),
  });
  if (error) throw error;
}
export async function reportOpportunity(opportunityId: string, userId: string, reason: string) {
  const { error } = await db.from('market_reports').insert({
    opportunity_id: opportunityId, reporter_id: userId, reason: reason.trim(),
  });
  if (error) throw error;
}
export async function blockUser(userId: string, blockedId: string) {
  const { error } = await db.from('blocks').insert({ blocker_id: userId, blocked_id: blockedId });
  if (error && error.code !== '23505') throw error;
}
export async function fetchBlockedIds(userId: string): Promise<Set<string>> {
  const { data, error } = await db.from('blocks').select('blocked_id').eq('blocker_id', userId);
  if (error) throw error;
  return new Set((data ?? []).map((row: any) => String(row.blocked_id)));
}
export async function isMarketAdmin(): Promise<boolean> {
  const { data, error } = await db.rpc('market_is_admin');
  if (error) throw error;
  return data === true;
}
export async function setMallSettings(mallId: number, enabled: boolean, allowed: MarketCategory[]) {
  const { error } = await db.from('market_mall_settings').upsert({
    mall_id: mallId, enabled, allowed_categories: allowed, updated_at: new Date().toISOString(),
  }, { onConflict: 'mall_id' });
  if (error) throw error;
}
export async function fetchReports(): Promise<MarketReport[]> {
  const { data, error } = await db.from('market_reports').select('*')
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data ?? [];
}
export async function moderateReport(reportId: string, status: 'reviewed' | 'resolved') {
  const { error } = await db.from('market_reports').update({ status }).eq('id', reportId);
  if (error) throw error;
}
export async function hideOpportunity(opportunityId: string) {
  const { error } = await db.from('market_opportunities').update({ status: 'hidden' })
    .eq('id', opportunityId);
  if (error) throw error;
}
export async function fetchAmbassadors(): Promise<MarketAmbassador[]> {
  const { data, error } = await db.from('market_ambassadors').select('*').limit(100);
  if (error) throw error;
  return data ?? [];
}
export async function saveAmbassador(userId: string, mallId: number | null, label: string) {
  const { error } = await db.from('market_ambassadors').upsert({
    user_id: userId, assigned_mall_id: mallId, display_label: label, active: true,
  }, { onConflict: 'user_id' });
  if (error) throw error;
}