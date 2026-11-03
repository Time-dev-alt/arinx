import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export const publicContent = createServerFn({ method: 'GET' })
  .inputValidator((input: { kind: 'video' | 'channel'; id: string }) => {
    if (!['video', 'channel'].includes(input.kind) || typeof input.id !== 'string' || input.id.length > 200) throw new Error('Invalid content');
    return input;
  })
  .handler(async ({ data }) => {
    const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
    const url = process.env['SUPABASE_URL'];
    if (!key || !url) throw new Error('Public content unavailable');
    const client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith('sb_') && headers.get('Authorization') === `Bearer ${key}`) headers.delete('Authorization');
        headers.set('apikey', key);
        return fetch(input, { ...init, headers });
      } },
    });
    if (data.kind === 'channel') {
      const { data: row, error } = await client.from('profiles').select('name,handle,bio').eq('handle', data.id).maybeSingle();
      if (error) throw error;
      return row ? { title: row.name, description: row.bio || `Watch videos from @${row.handle} on ArinX.`, uploaded: null as string | null, duration: 0 } : null;
    }
    if (!/^[0-9a-f-]{36}$/i.test(data.id)) return null;
    const { data: row, error } = await client.from('videos').select('title,description,created_at,duration').eq('id', data.id).eq('visibility', 'public').maybeSingle();
    if (error) throw error;
    return row ? { title: row.title, description: row.description || `Watch ${row.title} on ArinX.`, uploaded: row.created_at, duration: row.duration } : null;
  });
