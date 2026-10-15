import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft, ArrowRight, Bell, Check, CheckCheck, ChevronDown, Clock3,
  Flag, Handshake, HeartHandshake, LockKeyhole, MapPin, MessageCircle,
  Plus, RefreshCw, Search, Send, ShieldCheck, ShoppingBag, Tag, Ticket,
  Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  CATEGORY_HELP, CATEGORY_LABEL, blockUser, closeOpportunity,
  createOpportunity, currentUserId, fetchAmbassadors, fetchBlockedIds,
  fetchInterests, fetchLiveOpportunities, fetchMalls, fetchMessages,
  fetchMyOpportunities, fetchReports, hideOpportunity, isMarketAdmin,
  moderateReport, reportOpportunity, saveAmbassador, sendInterest,
  sendMessage, setMallSettings, transitionInterest,
  type InterestStatus, type MarketAmbassador, type MarketCategory,
  type MarketIntent, type MarketInterest, type MarketMall, type MarketMessage,
  type MarketReport, type Opportunity,
} from './market';
import './ngaam.css';

type Page = 'discover' | 'post' | 'mine' | 'manage';
type MaybeError = { message?: string };
const CATEGORY_COLOURS: Record<MarketCategory, string> = {
  group_buy: 'orange', coupon: 'pink', queue: 'blue', parking: 'green',
};
const ICONS = { group_buy: Users, coupon: Tag, queue: Ticket, parking: MapPin };
const STATUS_LABEL: Record<InterestStatus, string> = {
  requested: '等緊回覆', accepted: '已配對', declined: '已婉拒',
  cancelled: '已取消', completed: '已完成',
};

function friendlyError(error: unknown): string {
  const s = String((error as MaybeError)?.message ?? error ?? '未知錯誤');
  if (/relation.*does not exist|schema cache|could not find the table/i.test(s))
    return '開發版資料庫仲未啟用，暫時唔可以刊登。';
  if (/permission|denied|row-level security|42501/i.test(s))
    return '你暫時冇權限完成呢個操作。';
  if (/duplicate|23505/i.test(s)) return '你已經提出過呢個配對請求。';
  return s;
}
function expiresLabel(expires: string): string {
  const ms = new Date(expires).getTime() - Date.now();
  if (ms <= 0) return '已過期';
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `仲有 ${mins} 分鐘`;
  return `有效至 ${new Date(expires).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}
function categoryIcon(category: MarketCategory) {
  const Icon = ICONS[category];
  return <Icon size={23} strokeWidth={2.3} aria-hidden="true" />;
}
function LoginNote({ title }: { title: string }) {
  return (
    <div className="ngaam-login-prompt">
      <LockKeyhole size={28} />
      <h3>{title}</h3>
      <p>睇機會唔使登入，刊登同配對先要建立帳戶。</p>
      <Link to="/auth" className="ngaam-button ngaam-button-dark">登入／建立帳戶 <ArrowRight size={18} /></Link>
    </div>
  );
}
function Card({ item, onOpen }: { item: Opportunity; onOpen: () => void }) {
  const Icon = ICONS[item.category];
  return (
    <button className={`ngaam-opportunity ngaam-opportunity-${CATEGORY_COLOURS[item.category]}`} onClick={onOpen}>
      <span className="ngaam-opp-icon"><Icon size={23} aria-hidden="true" /></span>
      <span className="ngaam-opportunity-info">
        <span className="ngaam-opp-meta">{CATEGORY_LABEL[item.category]}　·　{item.intent === 'need' ? '我想搵' : '我有'}</span>
        <strong>{item.title}</strong>
        <span className="ngaam-opportunity-bottom">
          <Clock3 size={13} /> {expiresLabel(item.expires_at)}
          {item.merchant_name && <span> · {item.merchant_name}</span>}
        </span>
      </span>
      <ArrowRight size={18} className="ngaam-card-arrow" />
    </button>
  );
}

function Compose({
  malls, selectedMall, userId, onCreated,
}: {
  malls: MarketMall[]; selectedMall: MarketMall | null; userId: string | null;
  onCreated: () => void;
}) {
  const [mallId, setMallId] = useState<number | null>(selectedMall?.id ?? null);
  const [category, setCategory] = useState<MarketCategory>('group_buy');
  const [intent, setIntent] = useState<MarketIntent>('need');
  const [title, setTitle] = useState('');
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [meetupHint, setMeetupHint] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [transferOK, setTransferOK] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setMallId(selectedMall?.id ?? null), [selectedMall?.id]);
  const mall = malls.find(m => m.id === mallId) ?? null;
  const enabled = Boolean(mall?.enabled && mall.allowed_categories.includes(category));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!userId) return setError('請先登入再刊登。');
    if (!mall || !enabled) return setError('呢個商場暫未開放呢類配對。');
    if (title.trim().length < 5) return setError('請用最少5個字講清楚你想搵乜。');
    if (intent === 'have' && category !== 'group_buy' && !transferOK)
      return setError('涉及第三方優惠或候位權益，請先確認有關商戶允許轉讓。');
    setBusy(true);
    try {
      await createOpportunity({
        owner_id: userId, mall_id: mall.id, category, intent,
        title: title.trim(), merchant_name: merchant.trim(),
        description: description.trim(), meetup_hint: meetupHint.trim(),
        issuer_transfer_permitted: intent === 'have' && transferOK,
        expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
      });
      toast.success('刊登成功！');
      setTitle(''); setDescription(''); setMerchant(''); setMeetupHint(''); setTransferOK(false);
      onCreated();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  if (!userId) return <LoginNote title="登入後就可以即時刊登" />;
  return (
    <section className="ngaam-body">
      <div className="ngaam-section-intro"><span>01 / 即時刊登</span><h2>你有？定係想搵？</h2><p>喺同一個商場，有人啱啱需要你嗰份機會。</p></div>
      <form className="ngaam-form" onSubmit={submit}>
        <label>商場
          <select value={mallId ?? ''} onChange={e => setMallId(e.target.value ? Number(e.target.value) : null)} required>
            <option value="">揀一個商場</option>
            {malls.filter(m => m.enabled).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <div className="ngaam-field-label">我而家…</div>
        <div className="ngaam-segmented">
          <button type="button" className={intent === 'need' ? 'chosen' : ''} onClick={() => setIntent('need')}>🔎 我想搵</button>
          <button type="button" className={intent === 'have' ? 'chosen' : ''} onClick={() => setIntent('have')}>✋ 我有</button>
        </div>
        <div className="ngaam-field-label">屬於邊種機會？</div>
        <div className="ngaam-category-grid ngaam-category-compact">
          {(Object.keys(CATEGORY_LABEL) as MarketCategory[]).map(c => {
            const allowed = mall?.allowed_categories.includes(c);
            return <button key={c} type="button" className={`ngaam-category ngaam-cat-${CATEGORY_COLOURS[c]} ${category === c ? 'chosen' : ''}`}
              onClick={() => { setCategory(c); setTransferOK(false); }}>
              {categoryIcon(c)}<strong>{CATEGORY_LABEL[c]}</strong>{!allowed && <small>未開放</small>}
            </button>;
          })}
        </div>
        {!enabled && <p className="ngaam-inline-note">呢個商場暫未開放「{CATEGORY_LABEL[category]}」。請揀其他已開放類別。</p>}
        <label>機會標題 <small>講清楚有乜／想搵乜</small>
          <input maxLength={100} value={title} onChange={e => setTitle(e.target.value)}
            placeholder={category === 'group_buy' ? '例如：想搵人夾兩杯飲品優惠' : '例如：今日指定商戶優惠券'} required />
        </label>
        <label>店舖名稱 <small>如適用</small>
          <input maxLength={100} value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="例如：商場內某咖啡店" />
        </label>
        <label>補充資料 <small>選填</small>
          <textarea rows={3} maxLength={1200} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="例如：優惠條件、指定貨品、可以配合嘅時間" />
        </label>
        <label>大概邊度交收？ <small>選填，唔好填個人資料</small>
          <input maxLength={120} value={meetupHint} onChange={e => setMeetupHint(e.target.value)} placeholder="例如：商場一樓中庭附近" />
        </label>
        <div className="ngaam-field-label">呢個機會幾耐有效？</div>
        <div className="ngaam-segmented">
          {[30, 60, 180].map(n => <button key={n} type="button" className={minutes === n ? 'chosen' : ''} onClick={() => setMinutes(n)}>{n < 60 ? `${n}分鐘` : `${n / 60}小時`}</button>)}
        </div>
        {intent === 'have' && category !== 'group_buy' && (
          <label className="ngaam-check"><input type="checkbox" checked={transferOK} onChange={e => setTransferOK(e.target.checked)} />
            我已經確認相關商戶／發行方容許轉讓或共享呢項權益。
          </label>
        )}
        <p className="ngaam-form-note"><ShieldCheck size={16} /> 平台只幫你同場配對，不代收款項；請按商戶規則使用優惠。</p>
        {error && <div className="ngaam-error" role="alert">{error}</div>}
        <button className="ngaam-button ngaam-button-dark ngaam-button-wide" type="submit" disabled={busy || !enabled}>
          {busy ? '刊登中…' : '即時刊登'} <ArrowRight size={18} />
        </button>
      </form>
    </section>
  );
}

function Detail({
  opportunity, userId, onClose, onRefresh, blocked,
}: {
  opportunity: Opportunity; userId: string | null;
  onClose: () => void; onRefresh: () => void; blocked: Set<string>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState('');
  const self = userId === opportunity.owner_id;
  async function takeAction(action: 'interest' | 'close' | 'report' | 'block') {
    if (!userId) { setError('請先登入再繼續。'); return; }
    setError(''); setBusy(true);
    try {
      if (action === 'interest') await sendInterest(opportunity.id, userId);
      if (action === 'close') await closeOpportunity(opportunity.id, userId);
      if (action === 'report') await reportOpportunity(opportunity.id, userId, reason.trim());
      if (action === 'block') await blockUser(userId, opportunity.owner_id);
      toast.success(action === 'interest' ? '已發出配對請求' : action === 'close' ? '已結束刊登' : action === 'report' ? '多謝你嘅舉報' : '已封鎖用戶');
      onRefresh(); onClose();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  return <div className="ngaam-overlay" onClick={onClose} role="presentation">
    <section className="ngaam-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ngaam-detail-heading">
      <button className="ngaam-close" aria-label="關閉" onClick={onClose}><X /></button>
      <div className={`ngaam-sheet-icon ngaam-cat-${CATEGORY_COLOURS[opportunity.category]}`}>{categoryIcon(opportunity.category)}</div>
      <p className="ngaam-eyebrow">{CATEGORY_LABEL[opportunity.category]} · {opportunity.intent === 'need' ? '我想搵' : '我有'}</p>
      <h2 id="ngaam-detail-heading">{opportunity.title}</h2>
      {opportunity.merchant_name && <p className="ngaam-detail-shop"><ShoppingBag size={16} /> {opportunity.merchant_name}</p>}
      <p className="ngaam-detail-time"><Clock3 size={16} /> {expiresLabel(opportunity.expires_at)}</p>
      {opportunity.description && <p className="ngaam-detail-copy">{opportunity.description}</p>}
      {opportunity.meetup_hint && <p className="ngaam-detail-copy">建議會合位置：{opportunity.meetup_hint}</p>}
      <p className="ngaam-form-note"><ShieldCheck size={17} /> 請先確認優惠及商戶條款。唔好喺聊天透露不必要嘅私人資料。</p>
      {error && <div className="ngaam-error" role="alert">{error}</div>}
      {!userId && <Link to="/auth" className="ngaam-button ngaam-button-dark ngaam-button-wide">登入後參與配對 <ArrowRight size={17} /></Link>}
      {userId && !self && !blocked.has(opportunity.owner_id) && <button disabled={busy} className="ngaam-button ngaam-button-dark ngaam-button-wide" onClick={() => takeAction('interest')}>
        {busy ? '處理中…' : opportunity.category === 'group_buy' ? '我都想夾！' : '我有興趣'} <ArrowRight size={18} />
      </button>}
      {userId && self && <button disabled={busy} className="ngaam-button ngaam-button-light ngaam-button-wide" onClick={() => takeAction('close')}>結束呢個刊登</button>}
      {userId && !self && <div className="ngaam-safety-actions">
        <button onClick={() => setReport(v => !v)}><Flag size={15} /> 舉報刊登</button>
        <button disabled={busy} onClick={() => takeAction('block')}><ShieldCheck size={15} /> 封鎖用戶</button>
      </div>}
      {report && <div className="ngaam-report-form"><label>舉報原因<textarea maxLength={500} rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="請具體講吓有咩問題（最少5個字）" /></label><button className="ngaam-button ngaam-button-dark" disabled={busy || reason.trim().length < 5} onClick={() => takeAction('report')}>提交舉報</button></div>}
    </section>
  </div>;
}

function Conversation({ interest, userId, onClose }: { interest: MarketInterest; userId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<MarketMessage[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setMessages(await fetchMessages(interest.id)); }
    catch (e) { setError(friendlyError(e)); }
  }, [interest.id]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 6000); return () => clearInterval(timer); }, [load]);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true); setError('');
    try { await sendMessage(interest.id, userId, body.trim()); setBody(''); await load(); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  return <div className="ngaam-overlay" role="presentation" onClick={onClose}>
    <section className="ngaam-sheet ngaam-chat-sheet" role="dialog" aria-modal="true" aria-label="配對訊息" onClick={e => e.stopPropagation()}>
      <button className="ngaam-close" aria-label="關閉對話" onClick={onClose}><X /></button>
      <h2><MessageCircle size={22} /> 配對訊息</h2>
      <p className="ngaam-chat-tip">只同已接受配對嘅對方傾偈；請勿分享敏感資料。</p>
      <div className="ngaam-chat-messages" aria-live="polite">
        {messages.length === 0 && <p className="ngaam-chat-empty">仲未有訊息。可以打聲招呼！</p>}
        {messages.map(m => <div key={m.id} className={`ngaam-chat-bubble ${m.sender_id === userId ? 'self' : ''}`}>
          {m.body}<small>{new Date(m.created_at).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false })}</small>
        </div>)}
      </div>
      {error && <div role="alert" className="ngaam-error">{error}</div>}
      <form onSubmit={send} className="ngaam-chat-compose"><input maxLength={1000} value={body} onChange={e => setBody(e.target.value)} placeholder="輸入訊息…" aria-label="輸入訊息" /><button type="submit" disabled={busy || !body.trim()} aria-label="傳送訊息"><Send size={20} /></button></form>
    </section>
  </div>;
}

function MyActivity({
  userId, own, interests, others, onRefresh,
}: {
  userId: string | null; own: Opportunity[]; interests: MarketInterest[];
  others: Opportunity[]; onRefresh: () => void;
}) {
  const [chat, setChat] = useState<MarketInterest | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (!userId) return <LoginNote title="登入後睇返你嘅配對" />;
  const labels = new Map([...own, ...others].map(o => [o.id, o.title]));
  async function action(i: MarketInterest, next: InterestStatus) {
    setBusyId(i.id); setError('');
    try { await transitionInterest(i.id, next); toast.success('已更新配對狀態'); onRefresh(); }
    catch (e) { setError(friendlyError(e)); } finally { setBusyId(null); }
  }
  return <section className="ngaam-body">
    <div className="ngaam-section-intro"><span>02 / 我的機會</span><h2>配對進行中</h2><p>隨時睇返刊登、收到嘅請求同聊天。</p></div>
    {error && <div role="alert" className="ngaam-error">{error}</div>}
    <h3 className="ngaam-subheading">配對請求 · {interests.length}</h3>
    {interests.length === 0 && <div className="ngaam-empty-small">未有配對請求，試吓刊登第一個需要！</div>}
    {interests.map(i => {
      const ownRequest = i.requester_id === userId;
      return <div key={i.id} className="ngaam-activity-card">
        <div className="ngaam-activity-top"><strong>{labels.get(i.opportunity_id) ?? '配對機會'}</strong><span className={`ngaam-status ngaam-status-${i.status}`}>{STATUS_LABEL[i.status]}</span></div>
        <p>{ownRequest ? '我提出嘅請求' : '有人想回應你嘅刊登'}</p>
        <div className="ngaam-action-row">
          {!ownRequest && i.status === 'requested' && <><button disabled={busyId === i.id} onClick={() => action(i, 'accepted')}>接受配對</button><button disabled={busyId === i.id} className="subtle" onClick={() => action(i, 'declined')}>婉拒</button></>}
          {ownRequest && i.status === 'requested' && <button className="subtle" disabled={busyId === i.id} onClick={() => action(i, 'cancelled')}>取消請求</button>}
          {i.status === 'accepted' && <><button onClick={() => setChat(i)}><MessageCircle size={16} /> 傾偈</button><button className="subtle" disabled={busyId === i.id} onClick={() => action(i, 'completed')}><CheckCheck size={16} /> 已完成</button></>}
        </div>
      </div>;
    })}
    <h3 className="ngaam-subheading ngaam-extra-space">我的刊登 · {own.length}</h3>
    {own.length === 0 && <div className="ngaam-empty-small">你仲未刊登過機會。</div>}
    {own.map(o => <div key={o.id} className="ngaam-activity-card">
      <div className="ngaam-activity-top"><strong>{o.title}</strong><span className="ngaam-status">{o.status === 'active' && new Date(o.expires_at).getTime() > Date.now() ? '進行中' : '已結束'}</span></div>
      <p>{CATEGORY_LABEL[o.category]} · {expiresLabel(o.expires_at)}</p>
      {o.status === 'active' && <div className="ngaam-action-row"><button className="subtle" disabled={busyId === o.id} onClick={async () => {
        setBusyId(o.id); try { await closeOpportunity(o.id, userId); onRefresh(); } catch (e) { setError(friendlyError(e)); } finally { setBusyId(null); }
      }}>結束刊登</button></div>}
    </div>)}
    {chat && <Conversation interest={chat} userId={userId} onClose={() => setChat(null)} />}
  </section>;
}

function Manage({ malls, refreshAll }: { malls: MarketMall[]; refreshAll: () => void }) {
  const [term, setTerm] = useState('');
  const [reports, setReports] = useState<MarketReport[]>([]);
  const [ambassadors, setAmbassadors] = useState<MarketAmbassador[]>([]);
  const [newUserId, setNewUserId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newMallId, setNewMallId] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const refreshLocal = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([fetchReports(), fetchAmbassadors()]);
      setReports(r); setAmbassadors(a);
    } catch (e) { setError(friendlyError(e)); }
  }, []);
  useEffect(() => { void refreshLocal(); }, [refreshLocal]);
  const filtered = malls.filter(m => `${m.name} ${m.district ?? ''}`.includes(term)).slice(0, 30);
  async function toggleMall(m: MarketMall, enabled: boolean) {
    setBusy(`mall-${m.id}`); setError('');
    try { await setMallSettings(m.id, enabled, m.allowed_categories); refreshAll(); toast.success('商場設定已更新'); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
  }
  async function runReport(r: MarketReport, action: 'hide' | 'resolve') {
    setBusy(r.id); setError('');
    try {
      if (action === 'hide') await hideOpportunity(r.opportunity_id);
      await moderateReport(r.id, 'resolved');
      await refreshLocal(); refreshAll();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
  }
  async function addAmbassador(e: FormEvent) {
    e.preventDefault(); setBusy('ambassador'); setError('');
    try { await saveAmbassador(newUserId.trim(), newMallId, newLabel.trim());
      setNewUserId(''); setNewLabel(''); await refreshLocal(); toast.success('街坊大使已新增');
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
  }
  return <section className="ngaam-body">
    <div className="ngaam-section-intro"><span>03 / 營運後台</span><h2>即時掌握每個商場</h2><p>只供管理員使用。開放新場景之前，先核實商戶條款。</p></div>
    {error && <div role="alert" className="ngaam-error">{error}</div>}
    <div className="ngaam-stat-strip"><div><strong>{malls.filter(m => m.enabled).length}</strong><small>已啟動商場</small></div><div><strong>{reports.filter(r => r.status === 'open').length}</strong><small>待處理舉報</small></div><div><strong>{ambassadors.filter(a => a.active).length}</strong><small>街坊大使</small></div></div>
    <h3 className="ngaam-subheading">商場開關</h3>
    <input className="ngaam-search-admin" value={term} onChange={e => setTerm(e.target.value)} placeholder="搜尋商場／地區" />
    <div className="ngaam-admin-list">{filtered.map(m => <div key={m.id} className="ngaam-admin-row">
      <div><strong>{m.name}</strong><small>{m.district ?? '香港'} · {m.allowed_categories.map(c => CATEGORY_LABEL[c]).join('、')}</small></div>
      <button aria-label={`${m.enabled ? '暫停' : '開啟'} ${m.name}`} className={`ngaam-toggle ${m.enabled ? 'on' : ''}`} disabled={busy === `mall-${m.id}`} onClick={() => toggleMall(m, !m.enabled)}><span /></button>
    </div>)}</div>
    <p className="ngaam-inline-note">新啟動嘅商場預設只開放夾單同合資格優惠；候位／泊車要完成條款核實先可另行開放。</p>
    <h3 className="ngaam-subheading ngaam-extra-space">刊登舉報</h3>
    {reports.length === 0 && <div className="ngaam-empty-small">暫時冇舉報。</div>}
    {reports.map(r => <div className="ngaam-activity-card" key={r.id}>
      <div className="ngaam-activity-top"><strong>{r.reason}</strong><span className="ngaam-status">{r.status === 'open' ? '待處理' : '已處理'}</span></div>
      {r.status === 'open' && <div className="ngaam-action-row"><button disabled={busy === r.id} onClick={() => runReport(r, 'hide')}>隱藏刊登</button><button className="subtle" disabled={busy === r.id} onClick={() => runReport(r, 'resolve')}>標記已處理</button></div>}
    </div>)}
    <h3 className="ngaam-subheading ngaam-extra-space">街坊大使 · {ambassadors.length}</h3>
    {ambassadors.map(a => <div key={a.user_id} className="ngaam-admin-row"><div><strong>{a.display_label || '街坊大使'}</strong><small>{malls.find(m => m.id === a.assigned_mall_id)?.name ?? '未指定商場'} · {a.user_id.slice(0, 8)}</small></div><span className="ngaam-status">{a.active ? '啟用' : '停用'}</span></div>)}
    <form className="ngaam-form ngaam-ambassador-form" onSubmit={addAmbassador}>
      <label>新增街坊大使 · 用戶編號<input required pattern="[0-9a-fA-F-]{36}" placeholder="已註冊用戶嘅 UUID" value={newUserId} onChange={e => setNewUserId(e.target.value)} /></label>
      <label>顯示名稱<input required maxLength={60} placeholder="例如：沙田街坊大使" value={newLabel} onChange={e => setNewLabel(e.target.value)} /></label>
      <label>主要商場<select value={newMallId ?? ''} onChange={e => setNewMallId(e.target.value ? Number(e.target.value) : null)}><option value="">暫不指定</option>{malls.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <button type="submit" disabled={busy === 'ambassador'} className="ngaam-button ngaam-button-dark">新增大使 <Plus size={16} /></button>
    </form>
  </section>;
}

export function NgaamMarketplace() {
  const [page, setPage] = useState<Page>('discover');
  const [userId, setUserId] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [malls, setMalls] = useState<MarketMall[]>([]);
  const [mallId, setMallId] = useState<number | null>(null);
  const [category, setCategory] = useState<MarketCategory | 'all'>('all');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [own, setOwn] = useState<Opportunity[]>([]);
  const [interests, setInterests] = useState<MarketInterest[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Opportunity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    void currentUserId().then(async uid => {
      if (!alive) return;
      setUserId(uid);
      if (uid) {
        try { const okay = await isMarketAdmin(); if (alive) setAdmin(okay); }
        catch { if (alive) setAdmin(false); }
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) { setUserId(session?.user?.id ?? null); setVersion(v => v + 1); }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    let alive = true;
    void fetchMalls().then(items => {
      if (!alive) return;
      setMalls(items);
      setMallId(old => old && items.some(m => m.id === old && m.enabled) ? old : items.find(m => m.enabled)?.id ?? null);
      setError('');
    }).catch(e => { if (alive) setError(friendlyError(e)); });
    return () => { alive = false; };
  }, [version]);
  useEffect(() => {
    let alive = true;
    async function load() {
      setBusy(true);
      try {
        const [live, mine, unseen] = await Promise.all([
          mallId === null ? Promise.resolve([]) : fetchLiveOpportunities(mallId),
          userId ? fetchMyOpportunities(userId) : Promise.resolve([]),
          userId ? fetchBlockedIds(userId) : Promise.resolve(new Set<string>()),
        ]);
        const requests = userId ? await fetchInterests(userId, mine.map(o => o.id)) : [];
        if (alive) { setOpportunities(live); setOwn(mine); setInterests(requests); setBlocked(unseen); setError(''); }
      } catch (e) { if (alive) setError(friendlyError(e)); }
      finally { if (alive) setBusy(false); }
    }
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => { alive = false; clearInterval(timer); };
  }, [mallId, userId, version]);
  const selectedMall = malls.find(m => m.id === mallId) ?? null;
  const visible = useMemo(() => opportunities.filter(o => !blocked.has(o.owner_id) && (category === 'all' || o.category === category)), [opportunities, blocked, category]);
  const enabledMalls = malls.filter(m => m.enabled);
  const refreshing = () => setVersion(v => v + 1);
  const openPost = () => setPage('post');
  return <div className="ngaam-app">
    <div className="ngaam-viewport">
      <header className="ngaam-topbar">
        <button className="ngaam-wordmark" onClick={() => setPage('discover')} aria-label="啱啱好主頁">啱啱好<span className="ngaam-brand-dot" /></button>
        <div className="ngaam-top-actions"><button className="ngaam-round" aria-label="重新整理" onClick={refreshing}><RefreshCw size={19} /></button>{userId ? <button className="ngaam-member-pill" onClick={() => setPage('mine')}>我的配對</button> : <Link className="ngaam-member-pill" to="/auth">登入</Link>}</div>
      </header>
      {page === 'discover' && <>
        <section className="ngaam-hero"><div className="ngaam-hero-ribbons" aria-hidden="true"><span /><span /><span /></div><div className="ngaam-hero-content"><p className="ngaam-hero-overline">香港商場 · 即時資源配對</p><h1>啱時間。<br />啱地方。<br /><em>啱啱好！</em></h1><p>你身邊有人用唔着嘅，<br />可能就係你而家想搵嘅。</p></div></section>
        <section className="ngaam-location"><div className="ngaam-location-title"><MapPin size={18} /><span>你而家想喺邊個商場搵？</span></div><select aria-label="選擇商場" value={mallId ?? ''} onChange={e => setMallId(e.target.value ? Number(e.target.value) : null)}><option value="">{enabledMalls.length === 0 ? '商場服務準備中' : '揀一個商場'}</option>{enabledMalls.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><p>唔使開定位，都可以自己揀商場。</p></section>
        <section className="ngaam-body ngaam-discover-body"><div className="ngaam-section-row"><div><span className="ngaam-eyebrow">01 / 四大場景</span><h2>身邊啱啱有咩機會？</h2></div></div>
          <div className="ngaam-category-grid">{(Object.keys(CATEGORY_LABEL) as MarketCategory[]).map(c => <button key={c} className={`ngaam-category ngaam-cat-${CATEGORY_COLOURS[c]} ${category === c ? 'chosen' : ''}`} onClick={() => setCategory(category === c ? 'all' : c)}>{categoryIcon(c)}<strong>{CATEGORY_LABEL[c]}</strong><small>{selectedMall?.allowed_categories.includes(c) ? '即時配對' : '待開放'}</small></button>)}</div>
          <div className="ngaam-explainer"><span className="ngaam-explainer-symbol"><Handshake size={25} /></span><div><strong>同一個商場，即時夾得埋。</strong><p>有人想搵，有人啱啱有。唔使等幾日，唔使跨區跑。</p></div></div>
          <div className="ngaam-section-row ngaam-extra-space"><div><span className="ngaam-eyebrow">02 / 而家嘅機會</span><h2>同場、同時，即刻睇</h2></div><button className="ngaam-refresh-inline" onClick={refreshing} aria-label="重新整理"><RefreshCw size={17} /></button></div>
          {error && <div role="alert" className="ngaam-error">{error}</div>}
          {busy && <p className="ngaam-muted">更新中…</p>}
          {!busy && visible.length === 0 && <div className="ngaam-empty"><div className="ngaam-empty-icon"><Search size={30} /></div><strong>呢度仲未有人放機會</strong><p>{!selectedMall ? '我哋會逐個商場開放。' : '你可以做第一個提出需要嘅人，等同場嘅人回應你。'}</p><button className="ngaam-button ngaam-button-dark" onClick={openPost}>我想搵／我有 <ArrowRight size={17} /></button></div>}
          <div className="ngaam-opportunity-list">{visible.map(o => <Card key={o.id} item={o} onOpen={() => setDetail(o)} />)}</div>
        </section>
        <div className="ngaam-bottom-banner"><div><span>有嘢用唔着？</span><strong>放上嚟，可能啱啱有人要。</strong></div><button onClick={openPost} aria-label="刊登機會"><Plus size={23} /></button></div>
      </>}
      {page === 'post' && <Compose selectedMall={selectedMall} malls={malls} userId={userId} onCreated={() => { refreshing(); setPage('mine'); }} />}
      {page === 'mine' && <MyActivity userId={userId} own={own} interests={interests} others={opportunities} onRefresh={refreshing} />}
      {page === 'manage' && admin && <Manage malls={malls} refreshAll={refreshing} />}
      <footer className="ngaam-footer"><span>啱時間・啱地方・啱啱好</span><p>請遵守商戶條款，平台只提供資訊同配對服務。</p>{admin && <button onClick={() => setPage('manage')}>營運管理</button>}</footer>
      <nav className="ngaam-bottom-nav" aria-label="主要導覽">
        <button className={page === 'discover' ? 'current' : ''} onClick={() => setPage('discover')}><Search size={21} /><span>睇機會</span></button>
        <button className={page === 'post' ? 'current' : ''} onClick={() => setPage('post')}><span className="ngaam-plus"><Plus size={23} /></span><span>即時刊登</span></button>
        <button className={page === 'mine' ? 'current' : ''} onClick={() => setPage('mine')}><MessageCircle size={21} /><span>我的配對</span></button>
      </nav>
    </div>
    {detail && <Detail opportunity={detail} userId={userId} blocked={blocked} onClose={() => setDetail(null)} onRefresh={refreshing} />}
  </div>;
}