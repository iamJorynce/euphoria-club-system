'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#d946ef', '#8b5cf6', '#06b6d4', '#f59e0b'];

export function DashboardCharts({ paidOrders, rooms }: { paidOrders: any[]; rooms: any[] }) {
  const byRoom = rooms.map((r) => ({
    name: r.name,
    sales: paidOrders.filter((o) => o.room_id === r.id).reduce((s, o) => s + Number(o.grand_total), 0),
  }));

  // hourly sales bucket for "daily sales" trend
  const byHour: Record<string, number> = {};
  for (const o of paidOrders) {
    const hour = new Date(o.paid_at).getHours();
    const key = `${hour}:00`;
    byHour[key] = (byHour[key] || 0) + Number(o.grand_total);
  }
  const hourlyData = Object.entries(byHour)
    .map(([hour, sales]) => ({ hour, sales }))
    .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));

  return (
    <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 h-72">
        <div className="text-sm font-semibold text-neutral-300 mb-3">Sales by hour (tonight)</div>
        <ResponsiveContainer width="100%" height="88%">
          <BarChart data={hourlyData}>
            <XAxis dataKey="hour" stroke="#71717a" fontSize={11} />
            <YAxis stroke="#71717a" fontSize={11} />
            <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', fontSize: 12 }} />
            <Bar dataKey="sales" fill="#d946ef" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 h-72">
        <div className="text-sm font-semibold text-neutral-300 mb-3">Sales by room</div>
        <ResponsiveContainer width="100%" height="88%">
          <PieChart>
            <Pie data={byRoom} dataKey="sales" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={4}>
              {byRoom.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
