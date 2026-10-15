import { createFileRoute, Link } from '@tanstack/react-router';
export const Route = createFileRoute('/privacy')({
  head: () => ({ meta: [{ title: '私隱政策 · 啱啱好' }] }),
  component: PrivacyPage,
});
const SECTIONS: Array<[string,string]> = [
 ['我哋收集乜嘢資料？','建立帳戶時嘅電郵同顯示名稱；你選擇嘅商場、刊登資料、配對、對話、舉報、封鎖，以及你允許接收通知時所需嘅裝置資料。'],
 ['點解要收集？','只用於提供同場即時配對、傳送通知、維護帳戶安全及處理用戶舉報。'],
 ['邊個睇到？','公開刊登嘅內容會畀其他用戶睇到。配對對話應只限參與者同必要嘅獲授權管理員存取。唔會公開你嘅電郵同電話。'],
 ['可唔可以唔開定位？','可以。你可以自行揀商場，無需持續提供精確位置。'],
 ['帳戶刪除','你可以喺「我的配對」要求刪除帳戶。正式上架之前須測試刪除流程以及依法須保留嘅資料處理。'],
 ['第三方服務','帳戶及資料庫現時由 Supabase 支援，其他技術服務可能包括網站託管及通知提供商。'],
 ['正式政策待補充','開發版草稿。公開上架前須核實營運者法律名稱、有效電郵、完整資料保留期限、跨境資料處理及生效日期。'],
];
function PrivacyPage() {
return <main style={{maxWidth:620,margin:'auto',padding:'26px 20px 80px',fontFamily:'-apple-system, PingFang HK, sans-serif',background:'#fffdf8',minHeight:'100dvh',color:'#063f35'}}>
<Link to="/" style={{color:'#063f35',fontWeight:800}}>← 返回啱啱好</Link>
<h1 style={{fontSize:32,fontWeight:900,margin:'24px 0 4px'}}>私隱政策</h1>
<p style={{fontSize:13,marginBottom:24}}>啱啱好 · 開發版政策草稿（尚未可作正式對外政策）</p>
{SECTIONS.map(([title,body])=><section key={title} style={{border:'1px solid #e6e9e1',background:'white',borderRadius:16,padding:18,marginBottom:12}}><h2 style={{fontSize:16,fontWeight:850,margin:'0 0 8px'}}>{title}</h2><p style={{fontSize:14,lineHeight:1.75,margin:0}}>{body}</p></section>)}
</main>;
}
