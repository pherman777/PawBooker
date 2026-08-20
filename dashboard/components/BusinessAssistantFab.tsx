'use client';

import { Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type FormEvent } from 'react';

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type Message = {
  id: string;
  senderType: 'groomer' | 'bot';
  body: string;
};

// Ported from components/BusinessAssistantFab.tsx - same business_assistant_messages
// table and business-assistant edge function (Pro-gated, same as the app), a
// floating panel here instead of a full-screen modal since there's room on web.
export function BusinessAssistantFab() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  const isPro = groomerProfile?.plan === 'pro';

  const loadMessages = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);
    const { data } = await supabase
      .from('business_assistant_messages')
      .select('id, sender_type, body, created_at')
      .eq('groomer_id', groomerProfile.id)
      .order('created_at', { ascending: true });
    setMessages((data ?? []).map((row) => ({ id: row.id, senderType: row.sender_type, body: row.body })));
    setLoading(false);
  }, [groomerProfile]);

  function handleOpen() {
    if (!isPro) {
      router.push('/dashboard/plan');
      return;
    }
    setVisible(true);
    loadMessages();
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || !groomerProfile || sending) return;

    const optimistic: Message = { id: `local-${Date.now()}`, senderType: 'groomer', body: text };
    const history = messages.slice(-10).map((m) => ({ role: m.senderType === 'bot' ? 'assistant' : 'user', body: m.body }));
    setMessages((current) => [...current, optimistic]);
    setValue('');
    setSending(true);

    const { data, error } = await supabase.functions.invoke<{ reply?: string; error?: string }>('business-assistant', {
      body: { message: text, history },
    });

    setSending(false);

    if (error || !data?.reply) {
      window.alert(data?.error ?? (error instanceof Error ? error.message : 'Assistant unavailable.'));
      return;
    }
    setMessages((current) => [...current, { id: `local-bot-${Date.now()}`, senderType: 'bot', body: data.reply! }]);
  }

  if (!groomerProfile) return null;

  return (
    <>
      <button className="assistant-fab" onClick={handleOpen} aria-label="Business assistant">
        <Sparkles size={20} />
      </button>
      {visible && (
        <div className="assistant-panel">
          <div className="assistant-panel-header">
            <span>Business assistant</span>
            <button className="nav-icon-btn" onClick={() => setVisible(false)} aria-label="Close">
              <X size={15} />
            </button>
          </div>
          <div className="assistant-messages">
            {loading && <span className="spinner" aria-hidden />}
            {!loading && messages.length === 0 && (
              <p className="assistant-empty">
                Ask about revenue, lapsed customers, supply levels, upcoming bookings, or a specific customer.
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`assistant-msg assistant-msg-${m.senderType}`}>
                {m.body}
              </div>
            ))}
            {sending && <div className="assistant-msg assistant-msg-bot assistant-msg-typing">Thinking…</div>}
          </div>
          <form className="assistant-input-row" onSubmit={handleSend}>
            <input
              className="field-input"
              placeholder="Ask a question…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={sending}
            />
            <Button label="Send" type="submit" size="sm" disabled={sending || !value.trim()} />
          </form>
        </div>
      )}
    </>
  );
}
