import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, Bullets, type LegalSection } from "@/components/aah/LegalPage";
import { isNativeApp } from "@/lib/aah/push";
import { getRules } from "@/lib/aah/store";
import { multipleWord } from "@/lib/aah/rules";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "常見問題 · 啱啱好" },
      { name: "description", content: "啱啱好 BuyTime 常見問題及聯絡方法" },
    ],
  }),
  component: HelpPage,
});

const sections = (native: boolean): LegalSection[] => {
  const r = getRules();
  return [
    {
      title: "啱啱好係咩？",
      body: (
        <>
          <p>
            商場入面成日有人用唔着嘅嘢，例如泊車優惠單據（商場消費單，夠數可以換免費泊車）、餐廳排隊飛、優惠券；又有人啱啱用得着。
          </p>
          <p>好多嘢我哋越嚟越冇得揀，但呢啲嘢點樣分，其實我哋自己揀得。去到商場打開 app，就見到身邊有咩，亦可以搵人一齊夾單。</p>
        </>
      ),
    },
    {
      title: "要唔要錢？",
      body: (
        <p>
          唔使。啱啱好唔收交易費、唔收手續費、唔抽佣。你同對方點俾錢（現金、PayMe、轉數快、八達通）由你哋自己傾，平台唔經手。我哋靠 app 入面嘅廣告維持。
        </p>
      ),
    },
    {
      title: "點樣用？",
      body: (
        <Bullets
          items={[
            "想要：喺「搵」揀你要嘅，撳「有興趣」，對方揀咗你就配對。",
            "有嘢俾人：去「放」，揀類別、填資料，附近嘅人就見到。",
            "想夾單：去「夾」，開個夾單，或者撳人哋嘅「我夾」。",
            "配對之後：喺對話確認見面地點，揀今日打扮方便對方認你，到咗撳「我到咗」。",
          ]}
        />
      ),
    },
    {
      title: "可唔可以炒飛？",
      body: (
        <Bullets
          items={[
            "唔可以。啱啱好唔支持炒飛同黃牛。",
            "餐廳排隊飛收嘅錢叫「多謝費」，係多謝對方讓飛，唔係賣飛。",
            `餐廳排隊飛同泊車優惠單據有參考價：高過會提醒；高過參考價${multipleWord(r.priceBlockMultiple)}就放唔到。`,
            `每人每日最多放 ${r.limitDiningPerDay} 張餐廳排隊飛（同一間分店 ${r.limitDiningBranchPerDay} 張）、${r.limitParkingPerDay} 張泊車優惠單據。手上同時有幾多張冇問題，淨係限每日放幾多。`,
            "見到有人炒賣、見面先話要加錢，撳旗仔舉報。我哋冇辦法保證完全冇黃牛，但見到就封。",
            "放嘅舖頭或者餐廳唔喺我哋嗰個商場嘅名單，app 會提醒你。可能係我哋名單未齊，照樣放得，但自己睇清楚。",
          ]}
        />
      ),
    },
    {
      title: "泊車優惠單據點交收？",
      body: (
        <Bullets
          items={[
            "約喺商場詢問處或者換泊車嘅地方見面，一齊去換。",
            "單據成日連住信用卡底單，有部分卡號同簽名，唔使交俾對方：放嘅人自己交俾職員，換完攞返。",
            "要嘅人俾自己張泊車飛（或者講車牌）換，換到先俾錢。",
            "影單據時讀到日期唔係今日，就放唔到：商場一般只收即日單據。讀錯咗就再影清楚啲。",
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
            "冇出現嘅一方會被停用帳戶 30 日；有誤會可以喺 48 小時內喺「我的配對」申訴。",
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
            "喺 app 傾就夠。交換電話、WhatsApp、IG 有機會令個人資料外洩，app 會提醒你。",
          ]}
        />
      ),
    },
    {
      title: "點樣舉報或者封鎖？",
      body: (
        <Bullets
          items={[
            "喺 post、有興趣名單或者配對畫面，撳右上角嘅旗仔，揀原因舉報（包括炒飛、私下加價），或者淨係封鎖。",
            "舉報會交俾我哋人手審核，24 小時內處理；違規內容會被移除，嚴重或者重犯會被停用帳戶。",
            "封鎖之後，你哋唔會再見到對方嘅 post，亦唔可以再互動；進行中嘅配對會即刻取消，唔會罰你。",
            "去「我的配對」→「封鎖名單」可以解除封鎖。",
          ]}
        />
      ),
    },
    {
      title: "我嘅資料點用？",
      body: (
        <p>
          用嚟配對、防濫用、改善 app 同揀顯示咩廣告。推廣通知預設唔開，你開咗先會收。冇你同意，我哋唔會將認得出你嘅資料俾廣告商。詳細睇
          <Link to="/privacy" className="underline mx-0.5">
            私隱政策
          </Link>
          。
        </p>
      ),
    },
    {
      title: "收唔到通知？",
      body: (
        <Bullets
          items={[
            ...(native
              ? ["開住 app 嘅時候，有人有興趣、配對成功、對方傳訊息都會即時彈出提示。"]
              : [
                  "去「我的配對」打開「推送通知」。",
                  "iPhone 要先喺 Safari 撳分享 →「加至主畫面」，再由主畫面個「啱」字開 app，先收到通知。",
                ]),
            "檢查手機設定有冇封鎖咗啱啱好嘅通知，或者開咗專注模式。",
          ]}
        />
      ),
    },
    {
      title: "點樣刪除帳戶？",
      body: (
        <p>
          去「我的配對」→「帳戶」→「刪除帳戶」。有進行中嘅配對要先完成或者取消。已經刪咗 app 都可以電郵 support@buytime.hk 要求刪除（見私隱政策）。
        </p>
      ),
    },
    {
      title: "聯絡我哋",
      body: (
        <p>
          邊度唔好用、想加咩，可以喺「我的配對」→「話我哋知」直接講，或者電郵{" "}
          <a href="mailto:support@buytime.hk" className="underline">
            support@buytime.hk
          </a>
          。亦可以睇
          <Link to="/terms" className="underline mx-0.5">
            服務條款
          </Link>
          。
        </p>
      ),
    },
  ];
};

function HelpPage() {
  return <LegalPage title="常見問題" version="啱啱好 BuyTime" sections={sections(isNativeApp())} />;
}
