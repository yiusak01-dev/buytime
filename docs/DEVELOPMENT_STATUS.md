# 啱啱好｜開發狀態（不得直接合併／上架）
日期：2026-10-16

## 現階段已做到
- GitHub 獨立分支：feat/ngaam-ngaam-ho-mvp；master／正式網站冇修改。
- React/TypeScript 新介面：商場、四大類別、我有／我想搵、期限、刊登、配對請求、聊天室、舉報、封鎖及營運入口。
- 第一版隔離 SQL schema、RLS，以及防止重複接受／封鎖檢查（migration 001/002），**未喺生產資料庫執行**。
- 換咗首頁、登入、私隱／使用條款草稿、iOS Capacitor appId。
- 新分支暫停舊 send-push Edge Function。**正式資料庫仍有舊部署，不受 GitHub 分支修改影響。**

## 上架前阻塞項目（必須處理）
1. 舊正式 Supabase 安全問題：price_alerts、push_subscriptions 未啟用 RLS；messages、users 部分政策過闊；可能有管理函數過度授權。先分析影響、備份及獨立測試，再修補正式庫。
2. 舊 public GitHub history 曾提交 VAPID private key。必須輪換相應私鑰／公鑰對並更新正式推送訂閱，不能只係刪除目前檔案。評估改 Repository Private。
3. 新 SQL migration 尚未驗證可在空白 staging 資料庫完整安裝，也未做負面權限／端到端測試。**不可直接執行到 production**。
4. 依賴套件仍需在可連接 npm 嘅環境 install/build、完成 iOS 原生工程、簽署、裝置測試及 TestFlight。
5. account deletion UI 目前需要新 delete-account Edge Function，後端未部署，現時未可用；上架前必須完成並測試舊／新資料及備份保留處理。
6. 配對通知尚未重建；保護舊功能唔等於新 App 有通知。
7. 現時功能係人工回應刊登的流程；進一步加入同場、同時間、同店舖及需求互補嘅自動 matching，引導真實供需，而唔係單純列表。
8. 推出前補齊正式香港營運者身份、支援聯絡、私隱及使用條款、Apple App Store 顯示名稱、帳戶刪除及 UGC 審核流程。
9. 需要正式 Logo 原檔，不能由生成圖重畫已鎖定標誌。
10. iOS 裝置真機測試、App Review 及首次 TestFlight。

## 禁止事項
- 不得以假用戶／假刊登營造活躍度。
- 未獲第三方允許，不可刊登轉讓泊車優惠、候位機會。
- 無需搬回 Stripe escrow 或舊 10% 佣金。
- 未經審閱／測試，不得合併到 master 或部署正式站。
