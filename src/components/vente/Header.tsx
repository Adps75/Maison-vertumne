import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-paper/95 backdrop-blur-sm border-b border-hair-light">
      <div className="mx-auto w-full max-w-[1180px] px-[clamp(20px,6vw,120px)] flex items-center justify-between h-14">
        <Link href="/" className="font-serif font-medium text-[1.15rem] tracking-[0.04em] text-ink">
          Maison Vertumne
        </Link>
        <Link
          href="/estimation"
          className="bg-brass px-4 py-2 text-paper text-[0.82rem] font-medium rounded hover:bg-brass-soft transition-colors"
        >
          Estimer mon projet
        </Link>
      </div>
    </header>
  );
}
