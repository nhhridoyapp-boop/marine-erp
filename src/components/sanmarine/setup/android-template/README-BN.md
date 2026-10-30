# San Marine — Android APK তৈরির সহজ গাইড

## এই ZIP কী?
এটি স্বাধীন Android launcher / Trusted Web Activity (TWA) প্রকল্প। এটি আপনার প্রকাশিত অ্যাপ খুলবে; ERP-এর পূর্ণ সোর্স কোড, ব্যবহারকারীর তথ্য, ছবি, পাসওয়ার্ড বা API key এতে নেই। এটি APK নয় — Android Studio-তে APK তৈরি করতে হবে। Base44-এর পূর্ণ সোর্স ZIP export আলাদা সুবিধা (Builder+); এই launcher বানাতে সেটি লাগে না।

অ্যাপ ঠিকানা: https://san-marine-survey-inspection-scale-monitoring.base44.app/
Package ID: com.sanmarine.surveyinspection
ইন্টারনেট ও ফোনে আপডেট করা Chrome / TWA সমর্থিত browser দরকার। নতুন তথ্য আগের একই কেন্দ্রীয় ডাটাবেজে যাবে। WebView নয়, Chrome ব্যবহার করায় Google login ও browser file picker-এর স্বাভাবিক ব্যবস্থা থাকবে; আসল ফোনে বিতরণের আগে অবশ্যই যাচাই করুন।

## ১. কম্পিউটার প্রস্তুত করুন
1. Windows / Mac / Linux কম্পিউটারে https://developer.android.com/studio থেকে Android Studio ইনস্টল করুন। প্রথমবারের Setup Wizard-এ Android SDK ইনস্টল হতে দিন।
2. ZIP Extract করুন। Android Studio → Open → SanMarineAndroid ফোল্ডার নির্বাচন করুন।
3. Gradle Sync সম্পন্ন হতে দিন। প্রয়োজন হলে SDK Manager থেকে Android API 35 ইনস্টল করুন। Gradle JDK হিসেবে JDK 17 বা সামঞ্জস্যপূর্ণ Android Studio bundled JDK ব্যবহার করুন (Settings → Build Tools → Gradle)। Gradle / SDK প্রথমবার ইন্টারনেটে ডাউনলোড হবে।

## ২. পরীক্ষার APK
Android Studio → Build → Build Bundle(s) / APK(s) → Build APK(s)। নতুন সংস্করণে নাম Generate App Bundles or APKs হতে পারে।
ফাইল: app/build/outputs/apk/debug/app-debug.apk
ফোনে পাঠিয়ে খুলুন → এই browser / file manager-এর জন্য Install unknown apps অনুমতি দিন → Install। এটি পরীক্ষার জন্য; চূড়ান্ত বিতরণে signed release ব্যবহার করুন।

## ৩. সবাইকে দেওয়ার চূড়ান্ত APK
1. Build → Generate Signed Bundle / APK → APK → Next।
2. Create new key store → নিজের কম্পিউটারে নিরাপদ স্থানে একটি .jks তৈরি করুন। Password / key alias সংরক্ষণ করুন; key file বা password কাউকে পাঠাবেন না।
3. release নির্বাচন → Finish / Create।
4. Wizard-এর নির্বাচিত output location থেকে signed release APK নিন। WhatsApp / Drive / নিজের download link-এ এই APK দিন; ZIP বা AAB নয়।
5. ব্যবহারকারী ফোনে ওই ফাইল খুলে Install unknown apps অনুমতি দিয়ে Install করবে। প্রতিষ্ঠানের ফোনে এই অনুমতি বন্ধ থাকলে প্রশাসকের অনুমতি দরকার।

## ৪. পুরো স্ক্রিন (ব্রাউজার বার ছাড়া)
Digital Asset Links যাচাই না করা থাকলে APK একটি Chrome Custom Tab খুলবে — উপরে browser bar থাকবে। এটি কাজ না করার অর্থ নয়। পূর্ণস্ক্রিনের জন্য:
1. release signing certificate-এর SHA-256 fingerprint নিন: Android Studio-এর terminal-এ keytool -list -v -keystore আপনার-keystore.jks -alias আপনার-alias। Keytool password চাইবে।
2. Settings-এ Android কার্ডে সেই SHA-256 দিলে assetlinks.json তৈরি / ডাউনলোড করা যাবে।
3. ফাইলটি অ্যাপের host-এ https://san-marine-survey-inspection-scale-monitoring.base44.app/.well-known/assetlinks.json ঠিকানায় application/json হিসেবে, কোনো redirect ছাড়া, পরিবেশন করতে হবে। এর প্রকাশনার কাজ AI সহায়তায় আলাদা করে সম্পন্ন করুন; keystore বা password দেবেন না। Custom domain নিলে প্রকল্পের host, launch_url ও asset_statements-ও একই domain করুন।
4. Android অ্যাপ ও website-এর package / certificate মিললে Chrome পুরোস্ক্রিন চালু করবে। Google OAuth-এর মতো অন্য origin-এ গেলে নিরাপত্তার জন্য browser bar দেখা স্বাভাবিক।
5. Chrome না থাকলে supported browser ইনস্টল / আপডেট করুন।

## ৫. আপডেট
ওয়েবের পরিবর্তন publish করলে এই online launcher-এও নতুন অ্যাপ আসবে; আলাদা ডাটাবেজ নেই। Launcher / app icon পরিবর্তন করলে app/build.gradle-এর versionCode বাড়িয়ে আগের একই package ID ও keystore দিয়ে নতুন signed APK বানান। একই signing key না হলে পুরোনো APK-এর উপর আপডেট হবে না।

## ৬. PWA (APK-এর বিকল্প)
ফোনের Chrome-এ প্রকাশিত URL খুলুন; editor preview / WhatsApp in-app browser নয়। অ্যাপের Settings → PWA ইনস্টল বা Chrome ⋮ → Install app / Add to Home screen। Browser install prompt না দিলে এটি manual পথ। PWA-এর জন্য APK লাগে না; APK launcher-এর জন্য browser install prompt পাওয়াও বাধ্যতামূলক নয়। Offline-এ নতুন এন্ট্রি / live data / Gemini OCR চলবে না।

## ৭. ফ্রী OCR
ZIP-এর cloudflare-worker/README-BN.md অনুসরণ করুন। Gemini key শুধু Cloudflare Secret-এ রাখুন; launcher-এ রাখবেন না।

## ৮. বিতরণের আগে নিজের ফোনে যা দেখবেন
লগইন (Google ও ERP), ক্যামেরা / গ্যালারি থেকে ছবি, OCR-পরবর্তী সংশোধন, এন্ট্রি সংরক্ষণ ও অন্য ফোনে দেখা, রিপোর্ট / শেয়ার, offline notice, APK update। এখানে native APK compile বা device test সম্পন্ন করা হয়নি; Java ও Android SDK থাকা কম্পিউটারে build জরুরি।

অফিশিয়াল নির্দেশনা: https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2