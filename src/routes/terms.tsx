import { createFileRoute, Link } from '@tanstack/react-router';
export const Route = createFileRoute('/terms')({
 head: () => ({ meta: [{ title:'使用條款 · 啱啱好' }] }),
 component: TermsPage,
});
const SECTIONS: Array<[string,string]> = [
 ['服務性質','啱啱好係香港商場同場、同時資源及需求配對資訊平台，唔係商場、餐廳或優惠發行方。'],
 ['商戶條款優先','泊車、候位、優惠券及會員權益只限相關發行方明確容許轉讓、共享或夾單嘅情況。禁止假收據、囤積候位飛及繞過第三方使用規則。'],
 ['付款及責任','平台現階段唔代收或託管交易款項。使用者自行核實合資格條件、有效期及安排；平台配對唔代表商戶保證接受。切勿向陌生人預付款項。'],
 ['真實使用','用戶不得刊登假供應、冒充他人、騷擾其他用戶、炒賣不准轉讓之資源，亦不得操縱配對結果。'],
 ['內容安全','你可以舉報刊登、封鎖用戶。平台保留按規則移除不當內容及限制帳戶嘅權利。'],
 ['個人資料','請勿分享密碼、身份文件或不必要嘅個人資料。帳戶刪除及資料處理按正式私隱政策執行。'],
 ['法律版本','本頁係開發階段草稿；公開上架前須補上經確認嘅營運法律主體、適用法律、聯絡方法及正式生效日期。'],
];
function TermsPage(){return <main style={{maxWidth:620,margin:'auto',padding:'26px 20px 80px',fontFamily:'-apple-system, PingFang HK, sans-serif',background:'#fffdf8',minHeight:'100dvh',color:'#063f35'}}>
<Link to="/" style={{color:'#063f35',fontWeight:800}}>← 返回啱啱好</Link>
<h1 style={{fontSize:32,fontWeight:900,margin:'24px 0 4px'}}>使用條款</h1><p style={{fontSize:13,marginBottom:24}}>啱啱好 · 開發版條款草稿</p>
{SECTIONS.map(([title,body])=><section key={title} style={{border:'1px solid #e6e9e1',background:'white',borderRadius:16,padding:18,marginBottom:12}}><h2 style={{fontSize:16,fontWeight:850,margin:'0 0 8px'}}>{title}</h2><p style={{fontSize:14,lineHeight:1.75,margin:0}}>{body}</p></section>)}</main>}
