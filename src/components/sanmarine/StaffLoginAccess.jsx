import React from 'react';
import { Link } from 'react-router-dom';


export default function StaffLoginAccess({ email }) {

  return (
    <div className="rounded-xl border border-border bg-muted p-3 text-xs text-foreground space-y-2">
      <p>
        <b>আগেই অনুমোদিত স্টাফ?</b>{' '}
        আপনার অনুমোদিত ইমেইল দিয়ে Google লগইন করুন। ইমেইল-পাসওয়ার্ড লগইনের জন্য প্রথমবার ইমেইল যাচাই করে পাসওয়ার্ড সেট করুন; আগের স্টাফ আইডি ও অনুমোদন অপরিবর্তিত থাকবে।
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 font-bold">
        <Link className="text-primary underline" to={`/register?email=${encodeURIComponent(email?.includes('@') ? email.trim() : '')}`}>প্রথমবার ইমেইল যাচাই</Link>
        <Link className="text-primary underline" to="/forgot-password">লগইন পাসওয়ার্ড ভুলে গেছেন?</Link>
      </div>
    </div>
  );
}