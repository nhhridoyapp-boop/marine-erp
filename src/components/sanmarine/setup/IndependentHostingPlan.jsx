import React from 'react';

export default function IndependentHostingPlan() {
  return (
    <details className="rounded-xl border border-border bg-card p-4 text-sm text-card-foreground space-y-3">
      <summary className="cursor-pointer font-bold">Independent Hosting — নিরাপদ Migration Plan</summary>
      <p>বর্তমান অ্যাপ শুধু অন্য হোস্টে রাখলে স্বাধীন হবে না: লগইন, রেকর্ড, অনুমতি, ব্যক্তিগত ফাইল, signed links এবং realtime sync এখনো Base44-এর ওপর নির্ভরশীল। Android ZIP-ও একই backend ব্যবহার করে।</p>
      <ol className="list-decimal pl-5 space-y-2">
        <li><b>সেফটি কপি:</b> সব রেকর্ড ও ব্যক্তিগত ফাইলের পূর্ণ ব্যাকআপ, মোট সংখ্যা, User/Staff ID, অনুমোদন, role ও hash checksum যাচাই; আগে পরীক্ষামূলক restore। অসম্পূর্ণ ব্যাকআপে migration বন্ধ।</li>
        <li><b>পরীক্ষামূলক পরিবেশ:</b> আলাদা database, authentication, private file storage এবং server-side role/company permissions তৈরি। মূল database ও অ্যাপ চালু থাকবে।</li>
        <li><b>পরিচয় অক্ষত রাখা:</b> পুরোনো ERP ID, Staff ID, সম্পর্ক ও ERP password hash অপরিবর্তিত রাখুন। Base44-এর নিজস্ব authentication/password infrastructure রপ্তানি হয় না; নতুন provider-এর পরিচয়ের সঙ্গে পুরোনো ERP profile নিরাপদে যুক্ত করতে হবে।</li>
        <li><b>সংযোগ প্রতিস্থাপন:</b> SDK-নির্ভর entity queries, login/OTP, uploads/signed URLs, realtime এবং OCR পরিবহন নতুন backend-এ প্রতিস্থাপন; secret শুধু server-এ। কোম্পানিবিহীন রেকর্ড Review-তে থাকবে, অনুমানভিত্তিক mapping নয়।</li>
        <li><b>গ্রহণযোগ্যতার পরীক্ষা:</b> অনুমোদিত staff login, role denial, দুই কোম্পানির isolation, খালি/লোড matching, ছবি ছাড়া block, serial concurrency, documents ও exports একই ফল দিতে হবে। Production-এ demo data নয়।</li>
        <li><b>চূড়ান্ত স্থানান্তর ও rollback:</b> সাময়িক write freeze, শেষ পরিবর্তন কপি, পুনরায় count/ID/hash যাচাই, তারপর domain switch। ব্যর্থ হলে আগের hosting/backend-এ ফেরত; দ্বৈত write নয় এবং পুরোনো database delete নয়।</li>
      </ol>
      <p className="text-muted-foreground">এটি পরিকল্পনা, migration সম্পন্ন হয়নি। Billing/Voucher-এর কার্যকর মডিউল বর্তমান অডিটে পাওয়া যায়নি; invoice/voucher ধরন ও হিসাবের নিয়ম নিশ্চিত না হওয়া পর্যন্ত নতুন financial module তৈরি করা হবে না।</p>
    </details>
  );
}