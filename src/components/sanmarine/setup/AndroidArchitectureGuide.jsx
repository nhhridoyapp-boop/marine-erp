import React from 'react';

export default function AndroidArchitectureGuide() {
  return <details className="rounded-xl border border-border bg-card p-3 text-sm space-y-3">
    <summary className="cursor-pointer font-bold">Android Architecture, Build ও বাস্তব Device Test</summary>
    <div className="pt-3 space-y-3">
      <p><b>দুটি আলাদা প্রকল্প:</b> এই ডাউনলোডের launcher template হলো TWA (Android Browser Helper); বর্তমান পূর্ণ ERP প্রকল্পে Capacitor-এর Android shell-ও আছে। কোনোটি Kotlin/Java-তে পুনর্লিখিত সম্পূর্ণ Native ERP নয়।</p>
      <p><b>TWA:</b> প্রকাশিত ERP খুলবে; Chrome/সমর্থিত browser লাগে। সঠিক domain ও release certificate-এর Digital Asset Links যাচাই হলে browser address bar থাকে না; যাচাই ব্যর্থ হলে Custom Tab bar থাকবে।</p>
      <p><b>Capacitor:</b> React ERP-এর production build native shell-এর WebView-এ থাকে; সাধারণ browser address bar থাকে না। বর্তমান Login, OCR, Cloudflare ও database অক্ষত রেখে native camera/GPS/file plugins যোগ করা যায়, কিন্তু plugin/permission bridge ও OAuth redirect বাস্তব ফোনে যাচাই না করে কাজ করছে বলা যায় না।</p>
      <p><b>বর্তমান ঘাটতি:</b> Capacitor manifest-এ শুধু Internet permission রয়েছে; location permission ও native GPS bridge এখনো যাচাই/সম্পূর্ণ করা হয়নি। Launcher-এর default icon-কে brand icon দিয়ে Android Studio-এর Image Asset দিয়ে প্রতিস্থাপন করতে হবে। APK এখনো তৈরি বা Device-tested নয়।</p>
      <ol className="list-decimal pl-5 space-y-2">
        <li>Capacitor-এর জন্য পূর্ণ ERP project export দরকার; ছোট TWA launcher ZIP দিয়ে Capacitor build হবে না। OCR key বা keystore frontend/ZIP-এ রাখবেন না।</li>
        <li>Android Studio-তে পূর্ণ project-এর android folder খুলুন, compatible Gradle JDK ও Android SDK ইনস্টল করুন; প্রথমে Gradle Sync সফল করুন।</li>
        <li>পূর্ণ project root-এ npm ci, তারপর npm run build:android চালিয়ে web assets sync করুন; debug APK-এর জন্য Android Studio-এর Build APK চালান।</li>
        <li>App name ও package com.sanmarine.surveyinspection যাচাই করুন; mipmap launcher assets এবং adaptive icon preview সব density-তে দেখুন।</li>
        <li>Camera/photo picker, fine/coarse location ও file access-এর native plugin/configuration প্রস্তুত করুন; Android-এর modern photo picker-এ অপ্রয়োজনীয় broad storage permission চাইবেন না।</li>
        <li>Build → Generate Signed Bundle / APK → APK বা Android App Bundle; ব্যক্তিগত keystore দিয়ে release sign করুন। Keystore/password নিরাপদে আলাদা রাখুন; পরের update-এ একই signing identity দরকার।</li>
      </ol>
      <p><b>NOT TESTED — ফোনে আবশ্যক:</b> Login/OAuth return, অনুমোদিত ও নিষিদ্ধ role, দুই কোম্পানির report/export, camera/photo picker, OCR Worker, GPS permission allow/deny/revoke, accuracy ও place reload, file download/share, Android Back, keyboard, rotation এবং দীর্ঘ সময় চালু রাখা।</p>
      <p><b>Offline:</b> bundled screen খুলতে পারে, কিন্তু database save/OCR/report-এর জন্য Internet লাগে; offline save/sync সমর্থিত বলে ধরা যাবে না। Network হারানো ও ফিরে আসা আলাদা করে যাচাই করতে হবে।</p>
      <p><b>Voucher:</b> বর্তমান ERP navigation-এ Voucher route পাওয়া যায়নি; পুরোনো APK/অন্য launch URL হলে তার installed package এবং launch URL মিলিয়ে দেখতে হবে—অনুমান করে Billing/Voucher পরিবর্তন করা হয়নি।</p>
      <p><b>কাজের সীমা:</b> এখানে web source ও guide প্রস্তুত করা যায়; Java/Android SDK ছাড়া APK/AAB compile বা signing সম্ভব নয়। বাস্তব device test ও release signing Android Studio-তে করতে হবে।</p>
      <p className="text-xs text-muted-foreground">Private ZIP download আগের মতো রাখা হয়েছে; client-side role check-কে পূর্ণ server-side download authorization বলা হচ্ছে না।</p>
    </div>
  </details>;
}