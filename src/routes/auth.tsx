import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const Route = createFileRoute('/auth')({
  head: () => ({ meta: [{ title: '登入／加入 · 啱啱好' }] }),
  component: Auth,
});
type Mode = 'signin' | 'signup' | 'forgot';

function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => {
    if (data.user) navigate({ to: '/' });
  }); }, [navigate]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setMessage(''); setError('');
    if (!email.includes('@')) return setError('請輸入有效電郵地址。');
    if (mode !== 'forgot' && password.length < 8) return setError('密碼最少要有8個字元。');
    if (mode === 'signup' && !nickname.trim()) return setError('請填寫顯示名稱。');
    setWaiting(true);
    try {
      if (mode === 'signin') {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
        toast.success('登入成功！');
        navigate({ to: '/' });
      } else if (mode === 'signup') {
        const { error: e } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/`, data: { name: nickname.trim() } },
        });
        if (e) throw e;
        setMessage('已送出確認電郵！請查閱收件箱，再按連結完成註冊。');
      } else {
        const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (e) throw e;
        setMessage('已送出密碼重設連結。請查閱電郵。');
      }
    } catch (e) { setError((e as Error)?.message ?? '發生錯誤，請稍後再試。'); }
    finally { setWaiting(false); }
  }
  return <main style={{ minHeight: '100dvh', background: '#ffda43', padding: '34px 18px 70px', fontFamily: '-apple-system, PingFang HK, sans-serif', color: '#063f35' }}>
    <div style={{ maxWidth: 430, margin: '0 auto' }}>
      <Link to="/" style={{ color: '#063f35', fontSize: 13, fontWeight: 700 }}>← 返回主頁</Link>
      <h1 style={{ fontSize: 44, fontWeight: 950, margin: '40px 0 0', letterSpacing: -3 }}>啱啱好</h1>
      <p style={{ fontSize: 14, fontWeight: 750, marginBottom: 30 }}>啱時間・啱地方・啱啱好</p>
      <section style={{ background: 'white', padding: 24, borderRadius: 25, boxShadow: '0 12px 38px rgba(4,50,40,.12)' }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 5 }}>{mode === 'signin' ? '歡迎返嚟！' : mode === 'signup' ? '加入啱啱好' : '重設密碼'}</h2>
        <p style={{ fontSize: 12, color: '#65776e', lineHeight: 1.6, marginBottom: 20 }}>同一個商場，搵到啱啱需要嘅機會。</p>
        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          {mode === 'signup' && <label style={{ fontSize: 12, display: 'grid', gap: 7, fontWeight: 800 }}>顯示名稱<input required maxLength={40} value={nickname} onChange={e => setNickname(e.target.value)} placeholder="點稱呼你好？" style={INPUT} /></label>}
          <label style={{ fontSize: 12, display: 'grid', gap: 7, fontWeight: 800 }}>電郵<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={INPUT} /></label>
          {mode !== 'forgot' && <label style={{ fontSize: 12, display: 'grid', gap: 7, fontWeight: 800 }}>密碼<input required type="password" minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="最少8個字元" style={INPUT} /></label>}
          {error && <p role="alert" style={{ background: '#ffe7e7', color: '#9e3333', padding: 12, borderRadius: 11, fontSize: 12 }}>{error}</p>}
          {message && <p role="status" style={{ background: '#e3f7e8', color: '#17603f', padding: 12, borderRadius: 11, fontSize: 12 }}>{message}</p>}
          <button type="submit" disabled={waiting} style={{ background: '#063f35', color: 'white', border: 0, borderRadius: 99, padding: '13px 20px', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>{waiting ? '處理中…' : mode === 'signin' ? '登入' : mode === 'signup' ? '建立帳戶' : '傳送重設連結'}</button>
        </form>
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, fontWeight: 750 }}>
          {mode !== 'signup' && <button style={SWITCH} onClick={() => { setMode('signup'); setError(''); setMessage(''); }}>未有帳戶？加入</button>}
          {mode !== 'signin' && <button style={SWITCH} onClick={() => { setMode('signin'); setError(''); setMessage(''); }}>已有帳戶？登入</button>}
          {mode === 'signin' && <button style={SWITCH} onClick={() => { setMode('forgot'); setError(''); setMessage(''); }}>忘記密碼？</button>}
        </div>
      </section>
      <p style={{ fontSize: 11, lineHeight: 1.6, textAlign: 'center', marginTop: 24 }}>建立帳戶代表你同意 <Link to="/terms" style={{ color: '#063f35', textDecoration: 'underline' }}>使用條款</Link> 同 <Link to="/privacy" style={{ color: '#063f35', textDecoration: 'underline' }}>私隱政策</Link>。</p>
    </div>
  </main>;
}
const INPUT = { border: '1.5px solid #d1e0d5', background: '#fafffa', minHeight: 46, borderRadius: 12, padding: '10px 13px', color: '#063f35', fontSize: 14 } as const;
const SWITCH = { color: '#063f35', background: 'transparent', border: 0, padding: 0, textDecoration: 'underline', cursor: 'pointer', fontSize: 12 } as const;