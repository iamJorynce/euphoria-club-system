import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/StatCard';

export default async function AuditLogsPage() {
  await requireModule('audit-logs');
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*, profiles:user_id(full_name)')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="pb-10">
      <PageHeader title="Audit Logs" description="Sensitive actions across the system" />
      <div className="px-4 space-y-2 mt-2">
        {(logs ?? []).map((log: any) => (
          <div key={log.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{log.action.replaceAll('_', ' ')}</span>
              <span className="text-xs text-neutral-500">{new Date(log.created_at).toLocaleString()}</span>
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              {log.profiles?.full_name ?? 'System'} · {log.module} {log.record_table ? `· ${log.record_table}` : ''}
            </div>
            {log.reason && <div className="text-xs text-neutral-400 mt-1.5 italic">"{log.reason}"</div>}
            {(log.old_value || log.new_value) && (
              <details className="mt-1.5">
                <summary className="text-xs text-fuchsia-400 cursor-pointer">View details</summary>
                <div className="grid grid-cols-2 gap-2 mt-1.5 text-[11px]">
                  <div className="bg-neutral-950 rounded p-2 overflow-x-auto">
                    <div className="text-neutral-600 mb-1">Old</div>
                    <pre className="whitespace-pre-wrap">{JSON.stringify(log.old_value, null, 1)}</pre>
                  </div>
                  <div className="bg-neutral-950 rounded p-2 overflow-x-auto">
                    <div className="text-neutral-600 mb-1">New</div>
                    <pre className="whitespace-pre-wrap">{JSON.stringify(log.new_value, null, 1)}</pre>
                  </div>
                </div>
              </details>
            )}
          </div>
        ))}
        {(logs ?? []).length === 0 && <div className="text-center text-neutral-600 text-sm py-10">No audit events yet.</div>}
      </div>
    </div>
  );
}
