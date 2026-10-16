// Smoke-check new standalone marketplace branch without deploying.
// Source inspection only: does not substitute for actual integration/iOS tests.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/ngaam/Marketplace.tsx');
const market=read('src/ngaam/market.ts');
const index=read('src/routes/index.tsx');
const config=read('capacitor.config.ts');
const schema=read('supabase/migrations/202610160001_ngaam_market_foundation.sql');
const followUp=read('supabase/migrations/202610160002_ngaam_matching_rls_fixes.sql');
const push=read('supabase/functions/send-push/index.ts');
assert.match(app,/啱啱好/);
assert.match(index,/NgaamMarketplace/);
for(const category of ['group_buy','coupon','queue','parking'])assert.match(market,new RegExp(category));
for(const table of ['market_opportunities','market_interests','market_messages','market_reports','market_ambassadors'])assert.match(schema,new RegExp(table));
assert.match(schema,/row level security/);
assert.match(followUp,/market_users_have_blocked_each_other/);
assert.match(config,/hk\.ngaamngaamho\.app/);
assert.doesNotMatch(config,/server\s*:\s*\{/);
assert.doesNotMatch(push,/VAPID_PRIVATE\s*=/);
console.log('Basic static source checks passed. Integration, security and App Store checks remain.');
