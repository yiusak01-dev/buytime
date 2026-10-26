import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, Bullets, type LegalSection } from "@/components/aah/LegalPage";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "常見問題 · 啱啱好" },
      { name: "description", content: "啱啱好 BuyTime 常見問題及聯絡方法" },
    ],
  }),
  component: HelpPage,
});

const SECTIONS: LegalSection[] = [
  {
    title: "啱啱好係咩？",
    body: (
      <p>
        同一個商場、同一時間，有人用唔着嘅嘢，你啱啱用得着。例如泊車收據、食飯攞咗但用唔着嘅籌、即時優惠，或者搵人一齊夾單。去到商場打開 app，就會見到身邊嘅着數。
      </p>
    ),
  },
  {
    title: "要唔要錢？",
    body: <p>用啱啱好完全免費，包括出 post、配對、傾偈同置頂。你同對方之間點樣俾錢（現金、PayMe、八達通），由你哋自己傾，平台唔會經手。</p>,
  },
  {
    title: "點樣用？",
    body: (
      <Bullets
        items={[
          "有嘢俾人：撳「出 post」，揀類別、填資料同你幾點走，發佈之後附近嘅人會見到。",
          "想要：喺首頁撳入有興趣嘅 post，撳「有興趣」，對方揀咗你就會配對。",
          "配對之後：喺對話確認見面地點，揀你今日嘅打扮方便對方認你，到咗撳「我到咗」。",
        ]}
      />
    ),
  },
  {
    title: "點解要開定位？",
    body: (
      <p>
        App 要知道你喺邊個商場，先可以顯示身邊嘅着數，同埋證明你真係喺度。其他人只會見到你喺邊個商場，唔會見到你嘅確實位置；我哋亦唔會儲存你嘅 GPS 座標。
      </p>
    ),
  },
  {
    title: "對方冇出現點算？",
    body: (
      <Bullets
        items={[
          "雙方確認見面之後，如果對方冇出現，可以喺配對畫面報告。",
          "冇出現嘅一方會被扣分同停用帳戶 30 日；有誤會可以喺 48 小時內喺「我的配對」申訴。",
          "有急事去唔到？喺約定時間之前撳「取消」，唔會被罰。",
        ]}
      />
    ),
  },
  {
    title: "點樣保障自己？",
    body: (
      <Bullets
        items={[
          "見面先俾錢，唔好預先轉數。",
          "收錢嗰位要睇自己電話嘅收款通知，唔好只睇對方截圖。",
          "唔好喺對話留電話或者地址；遇到可疑用戶，可以喺配對畫面舉報或者封鎖。",
        ]}
      />
    ),
  },
  {
    title: "積分有咩用？",
    body: <p>完成交收就會儲分同升等級，係你幫人嘅紀錄。積分唔可以換現金，亦唔可以轉俾人；冇出現會扣分。</p>,
  },
  {
    title: "收唔到通知？",
    body: (
      <Bullets
        items={[
          "去「我的配對」打開「推送通知」。",
          "iPhone 要先喺 Safari 撳分享 →「加至主畫面」，再由主畫面個「啱」字開 app，先收到通知。",
          "檢查手機設定有冇封鎖咗啱啱好嘅通知，或者開咗專注模式。",
        ]}
      />
    ),
  },
  {
    title: "點樣刪除帳戶？",
    body: <p>去「我的配對」→「帳戶」→「刪除帳戶」。有進行中嘅配對要先完成或者取消。</p>,
  },
  {
    title: "聯絡我哋",
    body: (
      <p>
        有任何問題或者建議，歡迎電郵 <a href="mailto:support@buytime.hk" className="underline">support@buytime.hk</a>。亦可以睇
        <Link to="/terms" className="underline mx-0.5">服務條款</Link>及
        <Link to="/privacy" className="underline mx-0.5">私隱政策</Link>。
      </p>
    ),
  },
];

function HelpPage() {
  return <LegalPage title="常見問題" version="啱啱好 BuyTime" sections={SECTIONS} />;
}
