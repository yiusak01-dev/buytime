#!/usr/bin/env bash
# 喺 Android 模擬器安裝測試 APK，設定位置（逸東商場），開 app 影相
set -x
mkdir -p ci-out
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell pm grant hk.buytime.app android.permission.ACCESS_FINE_LOCATION || true
adb shell pm grant hk.buytime.app android.permission.ACCESS_COARSE_LOCATION || true
adb emu geo fix 113.948 22.29 || true
adb shell monkey -p hk.buytime.app -c android.intent.category.LAUNCHER 1
sleep 20
adb exec-out screencap -p > ci-out/android-1-launch.png
for page in me terms; do
  adb shell am start -a android.intent.action.VIEW -d "hk.buytime.app://$page" hk.buytime.app
  sleep 8
  adb exec-out screencap -p > "ci-out/android-$page.png"
done
adb logcat -d | grep -iE "Capacitor|hk.buytime" | tail -300 > ci-out/android-logcat.txt || true
exit 0
