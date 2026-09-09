import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-neutral-950 text-center">
      <div>
        <h1 className="text-xl font-bold text-neutral-100 mb-2">Access restricted</h1>
        <p className="text-neutral-500 text-sm mb-6">Your role doesn't have permission to view this page.</p>
        <Link href="/dashboard" className="text-fuchsia-400 text-sm font-medium">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
