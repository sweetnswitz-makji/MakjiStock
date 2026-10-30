import Link from "next/link";
import { loadAdminProducts } from "@/lib/admin/data";
import { kstNow } from "@/lib/market/calendar";
import { priceSyncEnabled } from "@/lib/cafe24/price-sync";
import { setPriceSync } from "./actions";

export const dynamic = "force-dynamic";

const won = (n: number) => n.toLocaleString("ko-KR");

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const [{ rows, summary }, priceSyncOn] = await Promise.all([loadAdminProducts(), priceSyncEnabled()]);
  const now = kstNow();

  return (
    <main className="ap">
      <div className="ap__head">
        <div>
          <div className="ap__sub">{now.date} · {now.hour}시 기준</div>
          <h1>상품 관리</h1>
        </div>
        <Link href="/admin/products/new" className="ap-btn">빵 추가</Link>
      </div>

      {saved ? <p className="ap-msg ap-msg--ok" role="status">{saved} 저장했어요. 다음 가격 계산부터 반영돼요.</p> : null}
      {error ? <p className="ap-msg ap-msg--err" role="alert">{error}</p> : null}

      <form action={setPriceSync} className={`ap-switch${priceSyncOn ? "" : " ap-card--warn"}`}>
        <input type="hidden" name="on" value={priceSyncOn ? "0" : "1"} />
        <div>
          <b>몰 가격 반영 {priceSyncOn ? "켜짐" : "꺼짐"}</b>
          <small>
            {priceSyncOn
              ? "가격 계산 때마다 Cafe24 몰 판매가를 바꾸고, 02:00 에 정가로 되돌려요."
              : "가격은 계속 계산해 시세에 보여 주지만, Cafe24 몰 판매가는 바꾸지 않아요."}
          </small>
        </div>
        <button type="submit" className={`ap-btn${priceSyncOn ? " ap-btn--ghost" : ""}`}>
          {priceSyncOn ? "끄기" : "켜기"}
        </button>
      </form>

      <div className="ap-cards">
        <div className="ap-card"><span>판매 중</span><b>{summary.activeCount}종</b></div>
        <div className="ap-card"><span>오늘 오전가 반영</span><b>{summary.amApplied} / {summary.activeCount}</b></div>
        <div className="ap-card"><span>다음 가격 계산</span><b>{summary.nextRun}</b></div>
        <div className={`ap-card${summary.needsCheck > 0 ? " ap-card--warn" : ""}`}>
          <span>확인 필요 (오늘 계산 일부 실패·보류)</span><b>{summary.needsCheck}건</b>
        </div>
      </div>

      <div className="ap-tablewrap">
        <table className="ap-table">
          <thead>
            <tr>
              <th>상품</th>
              <th className="r">정가</th>
              <th className="r">지금 가격</th>
              <th className="r">할인율</th>
              <th>Cafe24</th>
              <th>검색어</th>
              <th>판매</th>
              <th><span className="sr-only">수정</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="ap-prod">
                    {r.photo_url ? (
                      <span className="ap-thumb" style={{ backgroundImage: `url("${encodeURI(r.photo_url)}")` }} aria-hidden="true" />
                    ) : (
                      <span className="ap-tk">{r.ticker}</span>
                    )}
                    <span style={{ display: "grid", gap: 2 }}>
                      <b>{r.display_name ?? r.name}</b>
                      <small className="mono">{r.ticker} · {r.full_name ?? r.name}</small>
                    </span>
                  </div>
                </td>
                <td className="r">{won(r.base_price_won)}원</td>
                <td className="r">
                  {r.todayPrice ? <>{won(r.todayPrice.priceWon)}원 <small className="mono">{r.todayPrice.session === "am" ? "오전" : "오후"}</small></> : "—"}
                </td>
                <td className="r" style={{ color: "#2C6199" }}>{r.todayPrice ? `${r.todayPrice.discountPct.toFixed(1)}%` : "—"}</td>
                <td className="mono">{r.cafe24_product_no ? `#${r.cafe24_product_no}` : "미연결"}</td>
                <td className="mono">{r.keywords.length}개</td>
                <td>
                  {!r.active ? (
                    <span className="ap-pill ap-pill--off">멈춤</span>
                  ) : r.neverPriced ? (
                    <span className="ap-pill ap-pill--wait" title="첫 가격 계산이 끝나면 시세 목록에 나와요">첫 가격 대기</span>
                  ) : (
                    <span className="ap-pill ap-pill--on">판매 중</span>
                  )}
                </td>
                <td className="r"><Link href={`/admin/products/${encodeURIComponent(r.id)}`}>수정</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="ap__note">판매를 멈추면 다음 가격 계산부터 빠지고, 시세 목록에서도 사라져요. 이미 받은 쿠폰과 잠금은 그대로 유효해요.</p>
    </main>
  );
}
