#!/usr/bin/env bash
# 喺 iPhone 模擬器安裝 app，設定位置（逸東商場），開 app 影相
set -x
mkdir -p ci-out
APP=$(find build/Build/Products -name "App.app" -path "*iphonesimulator*" | head -1)
DEV=$(xcrun simctl list devices available | grep -E "iPhone 1[5-7]( Pro)? \(" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
echo "device=$DEV app=$APP"
xcrun simctl boot "$DEV" || true
xcrun simctl bootstatus "$DEV" -b
xcrun simctl install "$DEV" "$APP"
xcrun simctl privacy "$DEV" grant location hk.buytime.app || true
xcrun simctl location "$DEV" set 22.29,113.948 || true
xcrun simctl launch "$DEV" hk.buytime.app
sleep 25
xcrun simctl io "$DEV" screenshot ci-out/ios-1-launch.png
sleep 10
xcrun simctl io "$DEV" screenshot ci-out/ios-2-after.png
xcrun simctl spawn "$DEV" log show --last 2m --predicate 'process == "App"' 2>/dev/null | tail -300 > ci-out/ios-log.txt || true
exit 0
