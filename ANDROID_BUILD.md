# SAN MARINE ERP — Real Android App বানানোর সম্পূর্ণ গাইড

এই অ্যাপটি একই Vite + React কোড থেকে দুটি উপায়ে Android অ্যাপ হতে পারে:
1. **Capacitor** (পূর্ণ native WebView shell — ভিতরে পুরো ERP থাকে)
2. **TWA Launcher** (Chrome browser দিয়ে প্রকাশিত অ্যাপ খোলে — হালকা ZIP)

দুটোতেই একই production Base44 backend ব্যবহার হয় — কোনো local/demo database নেই।

---

## পদ্ধতি ১: Capacitor (পূর্ণ Android অ্যাপ — পরামর্শিত)

### শর্ত
- কম্পিউটারে **Android Studio** ইনস্টল থাকতে হবে
- **Java JDK 17** ও **Android SDK API 35** দরকার
- পূর্ণ ERP সোর্স কোড লাগবে (Base44 Builder+ export থেকে নিতে হবে)

### ধাপ ১: প্রজেক্ট প্রস্তুত করুন
```bash
npm install
```

### ধাপ ২: Android-এ sync করুন (কোনো web build দরকার নেই)
```bash
npm run android:sync
```
অ্যাপটি লাইভ production URL থেকে লোড হয়, তাই `vite build` করতে হয় না। এই কমান্ড শুধু `android-shell-web/` স্প্ল্যাশ ফোল্ডারটি `android/app/src/main/assets/public/`-এ কপি করে এবং Capacitor কনফিগ তৈরি করে। `dist/` ফোল্ডারের কোনো দরকার নেই।

### ছবিতে দেখা missing cordova.variables.gradle ত্রুটি
এই ফাইল Capacitor sync তৈরি করে। শুধু android ফোল্ডার খুললে বা sync-এর আগে Android Studio খুললে এটি অনুপস্থিত থাকতে পারে। কোনো Gradle লাইন মুছবেন না।

1. Android Studio বন্ধ করুন।
2. পুরো প্রকল্প Extract All করুন; package.json থাকা মূল ফোল্ডারে Terminal খুলুন।
3. npm install, তারপর npm run android:sync সম্পূর্ণ শেষ হতে দিন (কোনো web build লাগবে না)।
4. npm run android:open চালান — এই কমান্ড sync শেষ করেই Studio খুলবে।
5. Gradle JDK 17 বেছে নিয়ে File → Sync Project with Gradle Files দিন।

প্রস্তুত ZIP-এ generated Capacitor connection folder-ও রাখা হয়েছে; নিজের কম্পিউটারে sync আবার চালাতে হবে। কোনো ব্যক্তিগত keystore, password অথবা API secret ZIP-এ রাখবেন না।

### ধাপ ৩: Android Studio-তে খুলুন
```bash
npm run android:open
```
অথবা সরাসরি Android Studio → Open → `android/` ফোল্ডার নির্বাচন করুন।

### ধাপ ৪: Gradle Sync
Android Studio খোলার পরে স্বয়ংক্রিয়ভাবে Gradle Sync হবে। না হলে:
- **File → Sync Project with Gradle Files**
- SDK API 35 ও Gradle JDK 17 নির্বাচন করুন (File → Project Structure → SDK Location)

### ধাপ ৫: Debug APK বানান (পরীক্ষার জন্য)
```bash
npm run android:apk
```
ফাইল: `android/app/build/outputs/apk/debug/app-debug.apk`
ফোনে দিয়ে ইনস্টল করুন (Install unknown apps অনুমতি দিন)।

### ধাপ ৬: Release APK বানান (বিতরণের জন্য)

#### ৬ক: Keystore তৈরি করুন (একবারই)
Android Studio → Build → Generate Signed Bundle / APK → APK → **Create new...**
- Key store path: `android/sanmarine.keystore`
- Password, Alias (sanmarine), Key password দিন
- নাম, প্রতিষ্ঠান, বছর পূরণ করুন
- **OK** → Next → release → Finish

#### ৬খ: অথবা কমান্ড লাইন থেকে
`android/keystore.properties` ফাইল বানান (git-এ commit করবেন না):
```properties
storeFile=../sanmarine.keystore
storePassword=আপনার_পাসওয়ার্ড
keyAlias=sanmarine
keyPassword=আপনার_পাসওয়ার্ড
```
তারপর:
```bash
npm run android:release
```
ফাইল: `android/app/build/outputs/apk/release/app-release.apk`

### ধাপ ৭: Play Store-এর জন্য AAB
```bash
npm run android:aab
```
ফাইল: `android/app/build/outputs/bundle/release/app-release.aab`

### ধাপ ৮: App icon প্রতিস্থাপন
```bash
npx @capacitor/assets generate --android --icon
```
অথবা Android Studio → `res/mipmap-*/ic_launcher.png` ম্যানুয়ালি বদলান।

---

## পদ্ধতি ২: TWA Launcher (সবচেয়ে সহজ — ZIP ডাউনলোড)

অ্যাপ → সিস্টেম সেটিংস → Android APK ও ZIP → **Android প্রকল্প ZIP ডাউনলোড** (শুধু Super Admin)।

1. ZIP Extract → Android Studio → Open → SanMarineAndroid → Gradle Sync।
2. Build → Generate Signed Bundle / APK → APK → Create new keystore → release → Finish।
3. Signed APK ফোনে দিন → Install unknown apps অনুমতি দিন।
4. **Digital Asset Links** সেট করুন (নিচে দেখুন) — না হলে browser bar থাকবে।

---

## পূর্ণস্ক্রিনের জন্য Digital Asset Links

Release keystore-এর SHA-256 fingerprint দিয়ে `assetlinks.json` বানান:
- অ্যাপ → সিস্টেম সেটিংস → Android APK ও ZIP → "পূর্ণস্ক্রিন APK-এর সংযোগ ফাইল" খুলুন
- SHA-256 দিন (৩২ জোড়া অক্ষর/সংখ্যা, কোলন দিয়ে)
- `assetlinks.json` ডাউনলোড হবে
- এটি প্রকাশিত host-এর `/.well-known/assetlinks.json`-এ দিন

---

## কোন কমান্ড কখন

| কাজ | কমান্ড |
|---|---|
| Web/PWA build | `npm run build:web` |
| Android build + sync | `npm run build:android` |
| Android Studio খোলা | `npm run android:open` |
| Debug APK | `npm run android:apk` |
| Release APK | `npm run android:release` |
| Release AAB (Play Store) | `npm run android:aab` |
| Dev server | `npm run dev` |

---

## Capacitor config
- appId: `com.sanmarine.surveyinspection`
- appName: `SAN MARINE SURVEY & INSPECTION`
- webDir: `dist`
- backgroundColor: `#0B2A4A`

---

## গুরুত্বপূর্ণ সতর্কতা
- **Keystore নিরাপদ রাখুন** — ভবিষ্যতে সব আপডেট এই keystore দিয়েই sign করতে হবে। হারালে Play Store-এ আপডেট আর দেওয়া যাবে না।
- **বাস্তব ফোনে যাচাই করুন**: Login, Google OAuth, camera/photo, GPS, OCR, report export, দুই কোম্পানির ডেটা।
- **Offline**: bundled screen খুলতে পারে, কিন্তু database save/OCR/report-এর জন্য Internet লাগে।
- **Email OTP**: custom domain verify না হলে পর্যন্ত blocked।
- **OCR key বা keystore** frontend/ZIP-এ রাখবেন না।

---

## এখানে কী করা যায়, কী নয়
- ✅ Web source ও guide প্রস্তুত করা যায়
- ✅ Capacitor android shell কনফিগার করা আছে
- ❌ এই ক্লাউড স্যান্ডবক্সে Java/Android SDK নেই — APK/AAB compile বা signing সম্ভব নয়
- ❌ বাস্তব device test ও release signing Android Studio-তে করতে হবে