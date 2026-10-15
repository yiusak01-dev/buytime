import { createFileRoute } from '@tanstack/react-router';
import { NgaamMarketplace } from '@/ngaam/Marketplace';

// New app lives only on the independent NGAAM development branch.
// The original BuyTime production branch remains untouched.
export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: '啱啱好 · 香港商場即時配對' },
    { name: 'description', content: '啱時間・啱地方・啱啱好。同一個商場，搵到啱啱需要嘅優惠、夾單同機會。' },
    { property: 'og:title', content: '啱啱好 · 香港商場即時配對' },
  ] }),
  component: NgaamMarketplace,
});