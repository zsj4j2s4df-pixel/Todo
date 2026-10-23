-- Extend the existing dispatcher only while push subscriptions or voice sessions exist.
select cron.schedule('todo-push-every-minute','* * * * *', $job$
 select net.http_post(
  url := 'https://pyqvxwxpsngbndkrlajz.supabase.co/functions/v1/push-dispatch',
  headers := jsonb_build_object('Content-Type','application/json','x-dispatch-key',(select decrypted_secret from vault.decrypted_secrets where name='todo_push_dispatch_key')),
  body := '{}'::jsonb,timeout_milliseconds := 55000
 ) where exists(select 1 from public.push_subscriptions) or exists(select 1 from private.realtime_sessions where state<>'closed');
$job$);
