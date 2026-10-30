import React from 'react';

export default function AndroidRepairGuide() {
  return (
    <div className="rounded-xl border border-border bg-muted p-3 space-y-2 text-sm">
      <h3 className="font-bold">ছবির Android Studio Sync ত্রুটি ঠিক করুন</h3>
      <p>Capacitor-এর তৈরি করা সংযোগ ফোল্ডারটি নেই। শুধু android ফোল্ডার খুললে এটি তৈরি হয় না; পুরো ZIP খুলে আগে নিচের প্রস্তুতি শেষ করুন।</p>
      <ol className="list-decimal pl-5 space-y-1">
        <li>Android Studio বন্ধ করুন এবং ZIP থেকে পুরো প্রজেক্ট Extract All করুন।</li>
        <li>যে মূল ফোল্ডারে package.json আছে সেখানে Terminal খুলুন; android ফোল্ডারের ভিতরে নয়।</li>
        <li><code>npm install</code> চালান, তারপর <code>npm run build:android</code> সম্পূর্ণ শেষ হতে দিন।</li>
        <li><code>npm run android:open</code> চালান; এটি প্রস্তুতি ও sync শেষ করে Android Studio খুলবে।</li>
        <li>Android Studio-তে Gradle JDK 17 নির্বাচন করে File → Sync Project with Gradle Files দিন।</li>
      </ol>
      <p className="text-xs text-muted-foreground">কোনো Gradle লাইন মুছবেন না। APK তৈরি ও সাইন করা এই কম্পিউটারে সম্পন্ন করতে হবে; এখানে APK তৈরি করা হয়নি।</p>
    </div>
  );
}