export default function DashboardLoading() {
  return (
    <main className="kk-page" aria-busy="true" aria-label="Đang tải dữ liệu">
      <div className="mb-4 h-24 animate-pulse rounded-2xl bg-slate-200/80" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-xl bg-slate-200/80"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-slate-200/80" />
    </main>
  );
}
