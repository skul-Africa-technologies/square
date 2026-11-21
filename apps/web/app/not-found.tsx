import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 gap-4">
      <h1 className="font-heading font-semibold text-text">Not found</h1>
      <p className="text-sm text-muted">The page you are looking for does not exist.</p>
      <Link href="/home" className="inline-flex items-center rounded-lg border bg-surface px-4 py-2 text-sm text-lime hover:bg-surface-hi">
        Back to Home
      </Link>
    </div>
  );
}
